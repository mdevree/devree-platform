import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getContact } from "@/lib/mautic";

const PURPOSE = "afspraak_link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const storedConfirmation = await prisma.appointmentConfirmation.findUnique({
    where: { agendaAfspraakId: id },
    include: {
      agendaAfspraak: {
        select: {
          contactNaam: true,
          contactTelefoon: true,
          contactEmail: true,
          mauticContactId: true,
          projectId: true,
        },
      },
    },
  });
  if (!storedConfirmation) {
    return NextResponse.json({ error: "Bevestiging niet gevonden" }, { status: 404 });
  }
  if (!storedConfirmation.videoPath) {
    return NextResponse.json({ error: "Upload eerst een video" }, { status: 400 });
  }

  const mauticContactId = storedConfirmation.agendaAfspraak.mauticContactId ?? storedConfirmation.mauticContactId;
  const mauticContact = !storedConfirmation.agendaAfspraak.contactTelefoon && mauticContactId
    ? await getContact(mauticContactId).catch(() => null)
    : null;
  const mauticName = mauticContact
    ? `${mauticContact.firstname} ${mauticContact.lastname}`.trim() || null
    : null;
  const recipientPhone = storedConfirmation.agendaAfspraak.contactTelefoon
    || mauticContact?.mobile
    || mauticContact?.phone
    || storedConfirmation.recipientPhone;
  const recipientName = storedConfirmation.agendaAfspraak.contactNaam
    || mauticName
    || storedConfirmation.recipientName;
  const recipientEmail = storedConfirmation.agendaAfspraak.contactEmail
    || mauticContact?.email
    || storedConfirmation.recipientEmail;

  if (!recipientPhone) {
    return NextResponse.json({ error: "Geen telefoonnummer op deze afspraak" }, { status: 400 });
  }

  if (recipientPhone !== storedConfirmation.agendaAfspraak.contactTelefoon) {
    await prisma.agendaAfspraak.update({
      where: { id },
      data: {
        contactNaam: recipientName,
        contactTelefoon: recipientPhone,
        contactEmail: recipientEmail,
        mauticContactId,
      },
    });
  }
  const confirmation = await prisma.appointmentConfirmation.update({
    where: { id: storedConfirmation.id },
    data: {
      recipientName,
      recipientPhone,
      recipientEmail,
      mauticContactId,
      projectId: storedConfirmation.agendaAfspraak.projectId ?? storedConfirmation.projectId,
      deliveryError: null,
    },
  });

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
