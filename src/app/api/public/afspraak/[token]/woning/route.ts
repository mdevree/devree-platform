import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentTokenHash, recordAppointmentEvent } from "@/lib/appointmentConfirmation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: { id: true, mauticContactId: true, woningUrl: true },
  });

  if (!confirmation?.woningUrl) {
    return NextResponse.redirect("https://www.devreemakelaardij.nl/");
  }

  await recordAppointmentEvent({
    confirmationId: confirmation.id,
    mauticContactId: confirmation.mauticContactId,
    eventType: "woning_click",
    path: request.nextUrl.pathname,
    clickedUrl: confirmation.woningUrl,
    userAgent: request.headers.get("user-agent"),
    rawPayload: { source: "public_woning_redirect", url: confirmation.woningUrl },
  });

  return NextResponse.redirect(confirmation.woningUrl);
}
