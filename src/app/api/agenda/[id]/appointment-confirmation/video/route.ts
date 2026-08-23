import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { appointmentVideoPath, appointmentVideoUploadDir } from "@/lib/appointmentConfirmation";

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

function safeExtension(name: string, mimeType: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".mp4") return ".mp4";
  if (mimeType === "video/mp4") return ".mp4";
  return null;
}

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
  const extension = safeExtension(file.name, file.type);
  if (!extension || file.type !== "video/mp4") {
    return NextResponse.json({ error: "Alleen MP4-video's worden ondersteund" }, { status: 400 });
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video is groter dan 80 MB" }, { status: 400 });
  }

  const uploadDir = appointmentVideoUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const filename = `${confirmation.id}-${Date.now()}${extension}`;
  const fullPath = appointmentVideoPath(filename);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, bytes);

  if (confirmation.videoPath && confirmation.videoPath !== fullPath) {
    unlink(confirmation.videoPath).catch(() => {});
  }

  const updated = await prisma.appointmentConfirmation.update({
    where: { id: confirmation.id },
    data: {
      status: confirmation.status === "draft" ? "ready" : confirmation.status,
      videoPath: fullPath,
      videoOriginalName: file.name,
      videoMimeType: file.type,
      videoSizeBytes: file.size,
      deliveryError: null,
    },
    include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
  });

  return NextResponse.json({ confirmation: updated });
}
