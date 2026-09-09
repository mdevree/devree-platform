import { appointmentPhase, appointmentTiming, appointmentWhatsappUrl, APPOINTMENT_REVIEW_URL } from "@/lib/appointmentLifecycle";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  appointmentTokenHash,
  formatAppointmentDateTime,
  isValidAppointmentPreview,
} from "@/lib/appointmentConfirmation";
import { appointmentCorsHeaders, appointmentCorsOptions } from "@/lib/appointmentCors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const previewRequested = request.nextUrl.searchParams.get("preview") === "1";
  const preview = previewRequested && isValidAppointmentPreview(
    token,
    request.nextUrl.searchParams.get("previewUntil") || undefined,
    request.nextUrl.searchParams.get("previewSig") || undefined
  );
  if (previewRequested && !preview) {
    return NextResponse.json(
      { error: "Deze previewlink is verlopen" },
      { status: 403, headers: appointmentCorsHeaders(request) }
    );
  }
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: {
      status: true,
      agendaAfspraak: { select: { agbegin: true, agend: true, agstatus: true, aginactive: true } },
      recipientName: true,
      woningTitle: true,
      woningAdres: true,
      woningUrl: true,
      woningImageUrl: true,
      appointmentStart: true,
      appointmentEnd: true,
      medewerker: true,
      videoPath: true,
      videoPosterIndex: true,
    },
  });

  if (!confirmation) {
    return NextResponse.json(
      { error: "Afspraak niet gevonden" },
      { status: 404, headers: appointmentCorsHeaders(request) }
    );
  }

  const timing = appointmentTiming(confirmation);
  return NextResponse.json(
    {
      confirmation: {
        status: confirmation.status,
        phase: appointmentPhase(confirmation),
        whatsappUrl: appointmentWhatsappUrl(confirmation.woningAdres || confirmation.woningTitle || "de woning", timing.start),
        reviewUrl: APPOINTMENT_REVIEW_URL,
        recipientName: confirmation.recipientName,
        woningTitle: confirmation.woningTitle,
        woningAdres: confirmation.woningAdres,
        woningUrl: confirmation.woningUrl,
        woningImageUrl: confirmation.woningImageUrl,
        appointmentLabel: formatAppointmentDateTime(timing.start),
        appointmentStart: timing.start,
        appointmentEnd: timing.end,
        medewerker: confirmation.medewerker,
        hasVideo: Boolean(confirmation.videoPath),
        posterUrl: confirmation.videoPath
          ? `/api/public/afspraak/${encodeURIComponent(token)}/poster`
          : null,
        calendarUrl: confirmation.appointmentStart
          ? `/api/public/afspraak/${encodeURIComponent(token)}/calendar`
          : null,
        mapsUrl: confirmation.woningAdres
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(confirmation.woningAdres)}`
          : null,
      },
      preview,
    },
    { headers: { ...appointmentCorsHeaders(request), "Cache-Control": "private, no-store", "X-Accel-Expires": "0" } }
  );
}

export function OPTIONS(request: NextRequest) {
  return appointmentCorsOptions(request);
}
