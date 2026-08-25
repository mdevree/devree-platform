import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentTokenHash } from "@/lib/appointmentConfirmation";
import { appointmentPosterPath } from "@/lib/appointmentVideo";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: { videoPath: true, videoPosterIndex: true },
  });
  if (!confirmation?.videoPath) {
    return NextResponse.json({ error: "Poster niet gevonden" }, { status: 404 });
  }

  const posterPath = appointmentPosterPath(confirmation.videoPath, confirmation.videoPosterIndex);
  const fileStat = await stat(posterPath).catch(() => null);
  if (!fileStat) {
    return NextResponse.json({ error: "Poster niet gevonden" }, { status: 404 });
  }
  return new NextResponse(Readable.toWeb(createReadStream(posterPath)) as ReadableStream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(fileStat.size),
      "Cache-Control": "no-store",
    },
  });
}
