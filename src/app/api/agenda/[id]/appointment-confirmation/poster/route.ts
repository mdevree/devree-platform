import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_POSTER_TIMESTAMPS } from "@/lib/appointmentVideo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= APPOINTMENT_POSTER_TIMESTAMPS.length) {
    return NextResponse.json({ error: "Ongeldige poster" }, { status: 400 });
  }
  const confirmation = await prisma.appointmentConfirmation.update({
    where: { agendaAfspraakId: id },
    data: { videoPosterIndex: index },
    include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
  }).catch(() => null);
  if (!confirmation?.videoPath) {
    return NextResponse.json({ error: "Bevestiging of video niet gevonden" }, { status: 404 });
  }
  return NextResponse.json({ confirmation });
}
