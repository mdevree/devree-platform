import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import {
  appointmentTokenFromPublicUrl,
  publicAppointmentPreviewUrl,
} from "@/lib/appointmentConfirmation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { agendaAfspraakId: id },
    select: { publicUrl: true },
  });
  if (!confirmation) {
    return NextResponse.json({ error: "Afspraakbevestiging niet gevonden" }, { status: 404 });
  }

  const token = appointmentTokenFromPublicUrl(confirmation.publicUrl);
  if (!token) {
    return NextResponse.json({ error: "Afspraaklink is ongeldig" }, { status: 409 });
  }

  return NextResponse.redirect(publicAppointmentPreviewUrl(token));
}
