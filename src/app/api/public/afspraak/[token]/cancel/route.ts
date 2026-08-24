import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentTokenHash, notifyOfficeAppointmentAction, recordAppointmentEvent } from "@/lib/appointmentConfirmation";
import { appointmentCorsHeaders, appointmentCorsOptions } from "@/lib/appointmentCors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
  });
  if (!confirmation) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404, headers: appointmentCorsHeaders(request) });
  }
  await recordAppointmentEvent({
    confirmationId: confirmation.id,
    mauticContactId: confirmation.mauticContactId,
    eventType: "cancel_click",
    path: request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent"),
    rawPayload: { source: "public_cancel" },
  });

  const cancelledAt = confirmation.cancelledAt || new Date();
  const updated = await prisma.appointmentConfirmation.update({
    where: { id: confirmation.id },
    data: {
      status: "cancel_requested",
      cancelledAt,
      deliveryError: null,
    },
  });

  await notifyOfficeAppointmentAction({
    confirmation: updated,
    action: "cancel_requested",
    actionAt: cancelledAt,
  });

  return NextResponse.json({ success: true, status: updated.status }, { headers: appointmentCorsHeaders(request) });
}

export function OPTIONS(request: NextRequest) {
  return appointmentCorsOptions(request);
}
