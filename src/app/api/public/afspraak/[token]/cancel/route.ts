import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentTokenHash, recordAppointmentEvent } from "@/lib/appointmentConfirmation";

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
  if (confirmation.status === "confirmed") {
    return NextResponse.json({ error: "Deze afspraak is al bevestigd" }, { status: 409 });
  }

  await recordAppointmentEvent({
    confirmationId: confirmation.id,
    mauticContactId: confirmation.mauticContactId,
    eventType: "cancel_click",
    path: request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent"),
    rawPayload: { source: "public_cancel" },
  });

  const updated = await prisma.appointmentConfirmation.update({
    where: { id: confirmation.id },
    data: {
      status: "cancel_requested",
      cancelledAt: confirmation.cancelledAt || new Date(),
      deliveryError: null,
    },
  });

  return NextResponse.json({ success: true, status: updated.status });
}
