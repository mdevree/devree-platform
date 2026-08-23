import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentTokenHash, notifyOfficeAppointmentAction, recordAppointmentEvent } from "@/lib/appointmentConfirmation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
  });
  if (!confirmation) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }
  if (confirmation.status === "cancel_requested" || confirmation.status === "cancelled") {
    return NextResponse.json({ error: "Deze afspraak is al als annulering ontvangen" }, { status: 409 });
  }

  await recordAppointmentEvent({
    confirmationId: confirmation.id,
    mauticContactId: confirmation.mauticContactId,
    eventType: "confirm_click",
    path: request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent"),
    rawPayload: { source: "public_confirm" },
  });

  const confirmedAt = confirmation.confirmedAt || new Date();
  const updated = await prisma.appointmentConfirmation.update({
    where: { id: confirmation.id },
    data: {
      status: "confirmed",
      confirmedAt,
      deliveryError: null,
    },
  });

  await notifyOfficeAppointmentAction({
    confirmation: updated,
    action: "confirmed",
    actionAt: confirmedAt,
  });

  return NextResponse.json({ success: true, status: updated.status });
}
