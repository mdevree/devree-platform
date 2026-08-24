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
  const preview = request.nextUrl.searchParams.get("preview") === "1" && isValidAppointmentPreview(
    token,
    request.nextUrl.searchParams.get("previewUntil") || undefined,
    request.nextUrl.searchParams.get("previewSig") || undefined
  );
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: {
      status: true,
      recipientName: true,
      woningTitle: true,
      woningAdres: true,
      woningUrl: true,
      appointmentStart: true,
      medewerker: true,
      videoPath: true,
    },
  });

  if (!confirmation) {
    return NextResponse.json(
      { error: "Afspraak niet gevonden" },
      { status: 404, headers: appointmentCorsHeaders(request) }
    );
  }

  return NextResponse.json(
    {
      confirmation: {
        status: confirmation.status,
        recipientName: confirmation.recipientName,
        woningTitle: confirmation.woningTitle,
        woningAdres: confirmation.woningAdres,
        woningUrl: confirmation.woningUrl,
        appointmentLabel: formatAppointmentDateTime(confirmation.appointmentStart),
        medewerker: confirmation.medewerker,
        hasVideo: Boolean(confirmation.videoPath),
      },
      preview,
    },
    { headers: appointmentCorsHeaders(request) }
  );
}

export function OPTIONS(request: NextRequest) {
  return appointmentCorsOptions(request);
}
