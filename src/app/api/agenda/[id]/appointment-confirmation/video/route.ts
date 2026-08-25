import { mkdir, stat, unlink, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { appointmentVideoPath, appointmentVideoUploadDir } from "@/lib/appointmentConfirmation";
import {
  appointmentVideoUploadKind,
  convertAppointmentMovToMp4,
  generateAppointmentPosters,
  removeAppointmentVideoFiles,
} from "@/lib/appointmentVideo";

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { agendaAfspraakId: id },
  });
  if (!confirmation) {
    return NextResponse.json({ error: "Maak eerst een bevestigingslink aan" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Geen videobestand ontvangen" }, { status: 400 });
  }
  const uploadKind = appointmentVideoUploadKind(file.name, file.type);
  if (!uploadKind) {
    return NextResponse.json({ error: "Alleen MP4- en MOV-video's worden ondersteund" }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video is groter dan 80 MB" }, { status: 400 });
  }

  const uploadDir = appointmentVideoUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const uploadId = `${confirmation.id}-${Date.now()}`;
  const filename = `${uploadId}.mp4`;
  const fullPath = appointmentVideoPath(filename);
  const sourcePath = uploadKind === "mov" ? appointmentVideoPath(`${uploadId}.source.mov`) : null;
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    if (sourcePath) {
      await writeFile(sourcePath, bytes);
      await convertAppointmentMovToMp4(sourcePath, fullPath);
    } else {
      await writeFile(fullPath, bytes);
    }

    await generateAppointmentPosters(fullPath);
    const convertedFile = await stat(fullPath);
    const updated = await prisma.appointmentConfirmation.update({
      where: { id: confirmation.id },
      data: {
        status: confirmation.status === "draft" ? "ready" : confirmation.status,
        videoPath: fullPath,
        videoOriginalName: file.name,
        videoMimeType: "video/mp4",
        videoSizeBytes: convertedFile.size,
        videoPosterIndex: 0,
        deliveryError: null,
      },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    });

    if (confirmation.videoPath && confirmation.videoPath !== fullPath) {
      removeAppointmentVideoFiles(confirmation.videoPath).catch(() => {});
    }
    return NextResponse.json({ confirmation: updated });
  } catch (error) {
    removeAppointmentVideoFiles(fullPath).catch(() => {});
    console.error("Afspraakvideo verwerken mislukt:", error);
    return NextResponse.json(
      { error: "De video kon niet worden verwerkt. Controleer het MOV- of MP4-bestand." },
      { status: 422 }
    );
  } finally {
    if (sourcePath) unlink(sourcePath).catch(() => {});
  }
}
