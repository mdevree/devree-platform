import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchContactByPhone, createContact, addContactPoints } from "@/lib/mautic";
import { normalizePhoneNumber } from "@/lib/phone";

// Zet WHATSAPP_WEBHOOK_DEBUG=1 om binnenkomende events gestructureerd te loggen
// (event-type, afzender, secret-match) tijdens het diagnosticeren van de inbox.
const DEBUG = process.env.WHATSAPP_WEBHOOK_DEBUG === "1";

type EvolutionMessage = {
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { caption?: string; fileName?: string };
    audioMessage?: unknown;
    stickerMessage?: unknown;
  };
  messageType?: string;
};

function getEvolutionMessage(data: unknown): EvolutionMessage | null {
  if (!data || typeof data !== "object") return null;

  const maybeRecord = data as Record<string, unknown>;
  if (Array.isArray(maybeRecord.messages) && maybeRecord.messages[0]) {
    return getEvolutionMessage(maybeRecord.messages[0]);
  }

  if (Array.isArray(data) && data[0]) {
    return getEvolutionMessage(data[0]);
  }

  if (maybeRecord.message && typeof maybeRecord.message === "object" && "key" in maybeRecord.message) {
    return maybeRecord.message as EvolutionMessage;
  }

  if (maybeRecord.key && typeof maybeRecord.key === "object") {
    return maybeRecord as EvolutionMessage;
  }

  return null;
}

function getMessageText(msg: EvolutionMessage): string {
  const message = msg.message;
  const text =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption;

  if (text) return text;
  if (message?.documentMessage?.fileName) return `[document: ${message.documentMessage.fileName}]`;
  if (message?.audioMessage) return "[audio bericht]";
  if (message?.stickerMessage) return "[sticker]";
  if (msg.messageType) return `[${msg.messageType}]`;
  return "[media bericht]";
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  const secretMatch =
    !process.env.EVOLUTION_WEBHOOK_SECRET ||
    secret === process.env.EVOLUTION_WEBHOOK_SECRET;

  const body = await req.json();

  // Evolution stuurt het event afhankelijk van versie/config als
  // "messages.upsert" óf "MESSAGES_UPSERT". Normaliseer naar dotted-lowercase.
  const event = String(body?.event ?? "")
    .toLowerCase()
    .replace(/_/g, ".");

  if (DEBUG) {
    console.log("[wa-webhook]", {
      rawEvent: body?.event,
      event,
      from: getEvolutionMessage(body?.data)?.key?.remoteJid,
      fromMe: getEvolutionMessage(body?.data)?.key?.fromMe,
      secretMatch,
    });
  }

  if (
    process.env.EVOLUTION_WEBHOOK_SECRET &&
    secret !== process.env.EVOLUTION_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (event !== "messages.upsert") {
    return NextResponse.json({ ok: true });
  }

  const msg = getEvolutionMessage(body.data);
  if (!msg || msg.key?.fromMe) {
    return NextResponse.json({ ok: true });
  }

  const waPhone: string = msg.key?.remoteJid ?? "";
  if (!waPhone || waPhone.includes("@g.us")) {
    return NextResponse.json({ ok: true });
  }

  const waName: string | undefined = msg.pushName ?? undefined;
  const bodyText = getMessageText(msg);
  const evolutionMsgId: string | undefined = msg.key?.id ?? undefined;

  let conversation = await prisma.waConversation.findFirst({
    where: { waPhone },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation || conversation.status === "CLOSED") {
    // Zoek of maak Mautic contact — strip @s.whatsapp.net en normaliseer
    const rawNumber = waPhone.replace("@s.whatsapp.net", "");
    const { plus31 } = normalizePhoneNumber(rawNumber.startsWith("31") ? `+${rawNumber}` : rawNumber);
    let mauticContactId: number | null = null;

    try {
      const existing = await searchContactByPhone(plus31);
      if (existing) {
        mauticContactId = existing.id;
      } else {
        const nameParts = (waName ?? "").split(" ");
        const created = await createContact({
          firstname: nameParts[0] ?? "",
          lastname: nameParts.slice(1).join(" ") ?? "",
          phone: plus31,
        });
        mauticContactId = created?.id ?? null;
      }
    } catch (err) {
      console.error("Mautic contact fout:", err);
    }

    conversation = await prisma.waConversation.create({
      data: { waPhone, waName, mauticContactId, status: "OPEN" },
    });
  } else if (waName && !conversation.waName) {
    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { waName },
    });
  }

  const existing = evolutionMsgId
    ? await prisma.waMessage.findUnique({ where: { evolutionMsgId } })
    : null;

  if (!existing) {
    await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: bodyText,
        evolutionMsgId,
      },
    });

    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Een inkomende WhatsApp-reactie is een engagement-signaal → voed Mautic.
    if (conversation.mauticContactId) {
      try {
        await addContactPoints(conversation.mauticContactId, 2);
      } catch (err) {
        console.error("Kon WhatsApp-punten niet naar Mautic schrijven:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
