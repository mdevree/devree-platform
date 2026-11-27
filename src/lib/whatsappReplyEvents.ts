import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppMessageId } from "./whatsapp-message-id";

export const WHATSAPP_REPLY_TEXT_LIMIT = 4000;
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export type ReplyAccount = "office" | "personal";

export function isWhatsAppReplyEnabled(account: ReplyAccount): boolean {
  return account === "personal"
    ? process.env.WHATSAPP_REPLY_PERSONAL_ENABLED === "1" &&
        Boolean(process.env.WHATSAPP_REPLY_OWNER_USER_ID)
    : process.env.WHATSAPP_REPLY_OFFICE_ENABLED === "1";
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export function normalizeReplyChatId(value: string): string | undefined {
  const match = /^(\d{7,15})@(?:c\.us|s\.whatsapp\.net)$/i.exec(value);
  return match ? `${match[1]}@c.us` : undefined;
}

export function getWahaOfficeChatId(payload: Record<string, unknown>): string | undefined {
  const key = object(object(payload._data)?.key);
  const fromMe = payload.fromMe === true;
  const chat = string(key?.remoteJidAlt) ?? string(payload.chatId) ?? string(fromMe ? payload.to : payload.from);
  if (chat || !fromMe) return chat;

  // NOWEB direct sends may omit "to" and "chatId". Use only a verified
  // phone JID here, keeping the alternate JID and explicit chat precedence.
  const remote = string(key?.remoteJid);
  return remote && normalizeReplyChatId(remote) ? remote : undefined;
}

function normalizeReplyId(value: unknown): string | undefined {
  const id = string(value);
  if (!id) return undefined;
  const normalized = normalizeWhatsAppMessageId(id);
  return normalized.length <= 191 ? normalized : undefined;
}

export type WahaReplyEvent = {
  session: string;
  chatId?: string;
  lid?: string;
  providerMessageId: string;
  occurredAt: Date;
  quotedMessageId?: string;
  type: "inbound" | "manual" | "api";
  body?: string;
};

export function getWahaReplyEvent(value: unknown, now = Date.now()): WahaReplyEvent | null {
  const event = object(value);
  if (!event || !["message", "message.any"].includes(String(event.event))) return null;
  const session = string(event.session);
  const p = object(event.payload);
  if (!session || !p || typeof p.fromMe !== "boolean") return null;

  const raw = object(p._data);
  const rawKey = object(raw?.key);
  const rawMessage = object(raw?.message);
  if (
    rawMessage?.reactionMessage || rawMessage?.protocolMessage ||
    rawMessage?.senderKeyDistributionMessage || rawMessage?.viewOnceMessage ||
    rawMessage?.viewOnceMessageV2 || p.ack === -1
  ) return null;

  const addresses = [
    rawKey?.remoteJid,
    rawKey?.remoteJidAlt,
    p.chatId,
    p.fromMe ? p.to : p.from,
  ].filter((item): item is string => typeof item === "string" && item !== "");
  if (addresses.some((address) => /@(?:g\.us|broadcast|newsletter)$/i.test(address))) return null;
  const phones = [...new Set(addresses.map(normalizeReplyChatId).filter(Boolean))];
  const lids = [...new Set(addresses.filter((address) => /^\d{5,20}@lid$/.test(address)))];
  if (phones.length > 1 || lids.length > 1 || (!phones.length && !lids.length)) return null;

  const providerMessageId = normalizeReplyId(p.id);
  const time = typeof p.timestamp === "number" ? p.timestamp * 1000 : NaN;
  if (!providerMessageId || !Number.isFinite(time) || time > now + 60_000 || time < now - MAX_EVENT_AGE_MS) {
    return null;
  }

  const body = string(p.body)?.trim();
  if (p.fromMe && (p.source !== "app" && p.source !== "api")) return null;
  if (!p.fromMe && (!body || p.hasMedia === true)) return null;
  if (p.fromMe && !body && p.hasMedia !== true) return null;

  return {
    session,
    chatId: phones[0],
    lid: lids[0],
    providerMessageId,
    occurredAt: new Date(time),
    quotedMessageId: normalizeReplyId(object(p.replyTo)?.id),
    type: p.fromMe ? (p.source === "app" ? "manual" : "api") : "inbound",
    body: p.fromMe ? undefined : body?.slice(0, WHATSAPP_REPLY_TEXT_LIMIT),
  };
}

export function validPersonalWahaSignature(rawBody: string, signature: string | null, key: string): boolean {
  if (!key || !signature || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function manualReplyCutoff(outboundAt: Date, quotedAt?: Date): Date {
  // WAHA timestamps have second granularity. A quoted ID establishes same-second order.
  const strictCutoff = outboundAt.getTime() - 1;
  return new Date(
    Math.max(strictCutoff, Math.min(quotedAt?.getTime() ?? strictCutoff, outboundAt.getTime())),
  );
}
