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

type NormalizedWhatsAppMessage = {
  waPhone: string;
  waName?: string;
  body: string;
  providerMsgId?: string;
  fromMe: boolean;
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

function toStorageJid(jid: string): string {
  if (jid.endsWith("@c.us")) return jid.replace("@c.us", "@s.whatsapp.net");
  return jid;
}

function getWahaMessage(body: unknown): NormalizedWhatsAppMessage | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") return null;

  const fromMe = payload.fromMe === true;
  const from = typeof payload.from === "string" ? payload.from : "";
  const to = typeof payload.to === "string" ? payload.to : "";
  const chatId =
    typeof payload.chatId === "string" ? payload.chatId : fromMe ? to : from;

  if (!chatId) return null;

  return {
    waPhone: toStorageJid(chatId),
    waName:
      typeof payload._data === "object" &&
      payload._data &&
      "notifyName" in payload._data &&
      typeof (payload._data as Record<string, unknown>).notifyName === "string"
        ? ((payload._data as Record<string, unknown>).notifyName as string)
        : undefined,
    body:
      typeof payload.body === "string" && payload.body
        ? payload.body
        : payload.hasMedia
          ? "[media bericht]"
          : "[bericht]",
    providerMsgId: typeof payload.id === "string" ? payload.id : undefined,
    fromMe,
  };
}

function normalizeWebhookMessage(
  event: string,
  body: unknown
): NormalizedWhatsAppMessage | null {
  const record = body as Record<string, unknown>;

  if (event === "message") {
    return getWahaMessage(body);
  }

  if (event !== "messages.upsert") {
    return null;
  }

  const msg = getEvolutionMessage(record.data);
  if (!msg) return null;

  return {
    waPhone: msg.key?.remoteJid ?? "",
    waName: msg.pushName ?? undefined,
    body: getMessageText(msg),
    providerMsgId: msg.key?.id ?? undefined,
    fromMe: msg.key?.fromMe === true,
  };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  const expectedSecret =
    process.env.WHATSAPP_WEBHOOK_SECRET || process.env.EVOLUTION_WEBHOOK_SECRET;
  const secretMatch = !expectedSecret || secret === expectedSecret;

  const body = await req.json();

  // Evolution stuurt het event afhankelijk van versie/config als
  // "messages.upsert" óf "MESSAGES_UPSERT". Normaliseer naar dotted-lowercase.
  const event = String(body?.event ?? "")
    .toLowerCase()
    .replace(/_/g, ".");

  const normalized = normalizeWebhookMessage(event, body);

  if (DEBUG) {
    console.log("[wa-webhook]", {
      rawEvent: body?.event,
      event,
      from: normalized?.waPhone,
      fromMe: normalized?.fromMe,
      secretMatch,
    });
  }

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (event !== "messages.upsert" && event !== "message") {
    return NextResponse.json({ ok: true });
  }

  const msg = normalized;
  if (!msg || msg.fromMe) {
    return NextResponse.json({ ok: true });
  }

  const waPhone = msg.waPhone;
  if (!waPhone || waPhone.includes("@g.us")) {
    return NextResponse.json({ ok: true });
  }

  const waName = msg.waName;
  const bodyText = msg.body;
  const providerMsgId = msg.providerMsgId;

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

  const existing = providerMsgId
    ? await prisma.waMessage.findUnique({ where: { evolutionMsgId: providerMsgId } })
    : null;

  if (!existing) {
    await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: bodyText,
        evolutionMsgId: providerMsgId,
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
