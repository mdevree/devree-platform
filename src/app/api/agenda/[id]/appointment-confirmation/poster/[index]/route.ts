import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { appointmentPosterPath, APPOINTMENT_POSTER_TIMESTAMPS } from "@/lib/appointmentVideo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }
  const { id, index: indexValue } = await params;
  const index = Number(indexValue);
  if (!Number.isInteger(index) || index < 0 || index >= APPOINTMENT_POSTER_TIMESTAMPS.length) {
    return NextResponse.json({ error: "Ongeldige poster" }, { status: 400 });
  }
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { agendaAfspraakId: id },
    select: { videoPath: true },
  });
  if (!confirmation?.videoPath) {
    return NextResponse.json({ error: "Poster niet gevonden" }, { status: 404 });
  }
  const posterPath = appointmentPosterPath(confirmation.videoPath, index);
  const fileStat = await stat(posterPath).catch(() => null);
  if (!fileStat) {
    return NextResponse.json({ error: "Poster niet gevonden" }, { status: 404 });
  }
  return new NextResponse(Readable.toWeb(createReadStream(posterPath)) as ReadableStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(fileStat.size),
      "Cache-Control": "private, max-age=300",
    },
  });
}
