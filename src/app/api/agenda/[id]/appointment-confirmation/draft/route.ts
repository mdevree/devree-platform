import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const PURPOSE = "afspraak_link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { agendaAfspraakId: id },
  });
  if (!confirmation) {
    return NextResponse.json({ error: "Bevestiging niet gevonden" }, { status: 404 });
  }
  if (!confirmation.videoPath) {
    return NextResponse.json({ error: "Upload eerst een video" }, { status: 400 });
  }
  if (!confirmation.recipientPhone) {
    return NextResponse.json({ error: "Geen telefoonnummer op deze afspraak" }, { status: 400 });
  }

  const existing = await prisma.followUpDraft.findUnique({
    where: { agendaAfspraakId_purpose: { agendaAfspraakId: id, purpose: PURPOSE } },
  });
  if (existing?.status === "sent") {
    return NextResponse.json({ error: "Het WhatsApp-concept is al verzonden", draft: existing }, { status: 409 });
  }

  const links: Prisma.InputJsonValue = {
    afspraak: confirmation.publicUrl,
    woning: confirmation.woningUrl,
  };
  const draft = await prisma.followUpDraft.upsert({
    where: { agendaAfspraakId_purpose: { agendaAfspraakId: id, purpose: PURPOSE } },
    create: {
      channel: "whatsapp",
      purpose: PURPOSE,
      agendaAfspraakId: id,
      mauticContactId: confirmation.mauticContactId,
      projectId: confirmation.projectId,
      recipientName: confirmation.recipientName,
      recipientPhone: confirmation.recipientPhone,
      recipientEmail: confirmation.recipientEmail,
      body: confirmation.whatsappBody,
      links,
      status: "draft",
      createdBy: "appointment_confirmation",
    },
    update: {
      mauticContactId: confirmation.mauticContactId,
      projectId: confirmation.projectId,
      recipientName: confirmation.recipientName,
      recipientPhone: confirmation.recipientPhone,
      recipientEmail: confirmation.recipientEmail,
      body: confirmation.whatsappBody,
      links,
      status: "draft",
      reviewedBy: null,
      reviewedAt: null,
      deliveryError: null,
    },
  });

  return NextResponse.json({ draft }, { status: existing ? 200 : 201 });
}
