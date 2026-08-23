import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { toWhatsAppJid } from "@/lib/phone";
import { sendWhatsAppMessage, WhatsAppError } from "@/lib/whatsapp";

async function openConversation(input: {
  phone: string;
  name: string | null;
  mauticContactId: number | null;
}) {
  const waPhone = toWhatsAppJid(input.phone);
  if (!waPhone) throw new Error("Geen geldig WhatsApp-nummer");

  const existing = await prisma.waConversation.findFirst({ where: { waPhone } });
  if (existing) {
    return prisma.waConversation.update({
      where: { id: existing.id },
      data: {
        status: "OPEN",
        waName: existing.waName || input.name,
        mauticContactId: existing.mauticContactId ?? input.mauticContactId,
      },
    });
  }

  return prisma.waConversation.create({
    data: {
      waPhone,
      waName: input.name,
      mauticContactId: input.mauticContactId,
      status: "OPEN",
    },
  });
}

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
  if (!confirmation.recipientPhone) {
    return NextResponse.json({ error: "Geen telefoonnummer op deze afspraak" }, { status: 400 });
  }
  if (!confirmation.videoPath) {
    return NextResponse.json({ error: "Upload eerst een MP4-video" }, { status: 400 });
  }

  const conversation = await openConversation({
    phone: confirmation.recipientPhone,
    name: confirmation.recipientName,
    mauticContactId: confirmation.mauticContactId,
  });

  try {
    const providerMsgId = await sendWhatsAppMessage(conversation.waPhone, confirmation.whatsappBody);
    const existing = providerMsgId
      ? await prisma.waMessage.findUnique({ where: { evolutionMsgId: providerMsgId } })
      : null;
    const message = existing ?? await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        body: confirmation.whatsappBody,
        deliveryStatus: "SENT",
        evolutionMsgId: providerMsgId,
      },
    });

    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), status: "OPEN" },
    });

    const updated = await prisma.appointmentConfirmation.update({
      where: { id: confirmation.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        waConversationId: conversation.id,
        waMessageId: message.id,
        deliveryError: null,
      },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    });

    return NextResponse.json({ confirmation: updated });
  } catch (error) {
    const detail =
      error instanceof WhatsAppError && error.detail
        ? error.detail
        : error instanceof Error
          ? error.message
          : String(error);
    const failed = await prisma.appointmentConfirmation.update({
      where: { id: confirmation.id },
      data: { status: "ready", deliveryError: detail },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    });

    return NextResponse.json({ error: detail, confirmation: failed }, { status: 502 });
  }
}
