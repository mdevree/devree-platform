import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  appointmentTokenHash,
  buildAppointmentCalendar,
  publicAppointmentUrl,
  recordAppointmentEvent,
} from "@/lib/appointmentConfirmation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: {
      id: true,
      mauticContactId: true,
      woningAdres: true,
      woningTitle: true,
      woningUrl: true,
      appointmentStart: true,
      appointmentEnd: true,
      publicUrl: true,
    },
  });
  if (!confirmation?.appointmentStart) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }

  const address = confirmation.woningAdres || confirmation.woningTitle || "De Vree Makelaardij";
  if (request.nextUrl.searchParams.get("preview") !== "1") {
    recordAppointmentEvent({
      confirmationId: confirmation.id,
      mauticContactId: confirmation.mauticContactId,
      eventType: "calendar_click",
      path: request.nextUrl.pathname,
    }).catch((error) => console.error("Agenda-download registreren mislukt:", error));
  }

  const calendar = buildAppointmentCalendar({
    id: confirmation.id,
    address,
    start: confirmation.appointmentStart,
    end: confirmation.appointmentEnd,
    publicUrl: confirmation.publicUrl || publicAppointmentUrl(token),
    woningUrl: confirmation.woningUrl,
  });
  return new NextResponse(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bezichtiging.ics"',
      "Cache-Control": "no-store",
    },
  });
}
