import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentTokenHash } from "@/lib/appointmentConfirmation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: { videoPath: true, videoMimeType: true },
  });

  if (!confirmation?.videoPath) {
    return NextResponse.json({ error: "Video niet gevonden" }, { status: 404 });
  }

  const fileStat = await stat(confirmation.videoPath).catch(() => null);
  if (!fileStat) {
    return NextResponse.json({ error: "Video niet gevonden" }, { status: 404 });
  }

  const range = request.headers.get("range");
  const contentType = confirmation.videoMimeType || "video/mp4";

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : fileStat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileStat.size) {
      return new NextResponse(null, { status: 416 });
    }

    const stream = createReadStream(confirmation.videoPath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const stream = createReadStream(confirmation.videoPath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileStat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
    },
  });
}
