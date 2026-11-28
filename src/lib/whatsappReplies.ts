import { sentMarketHashes } from "./whatsappMarketHomes";
import { sentPageHashes } from "./whatsappResourceLinks";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma, WaReplyDraft, WaReplyThread } from "@prisma/client";
import { getContactFull, searchContactByPhone } from "./mautic";
import { toWhatsAppJid } from "./phone";
import { prisma } from "./prisma";
import { sendWhatsAppMessage, sendPersonalWhatsAppMessage, WhatsAppError } from "./whatsapp";
import {
  isWhatsAppReplyEnabled,
  manualReplyCutoff,
  normalizeReplyChatId,
  WHATSAPP_REPLY_TEXT_LIMIT,
  type ReplyAccount,
  type WahaReplyEvent,
} from "./whatsappReplyEvents";

type Transaction = Prisma.TransactionClient;
type DraftContext = Pick<WaReplyDraft, "ownerUserId" | "conversationId" | "mauticContactId" | "recipientName">;

const DEBOUNCE_MS = 20_000;
const SEND_LEASE_MS = 120_000;
const MAX_SOURCE_MESSAGES = 8;
const DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

export class WhatsAppReplyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WhatsAppReplyError";
  }
}

export function canAccessWhatsAppReplyDraft(
  draft: Pick<WaReplyDraft, "account" | "ownerUserId">,
  actorUserId: string,
): boolean {
  if (draft.account === "office") return isWhatsAppReplyEnabled("office");
  return draft.account === "personal" && isWhatsAppReplyEnabled("personal") &&
    draft.ownerUserId === actorUserId && actorUserId === process.env.WHATSAPP_REPLY_OWNER_USER_ID;
}

function threadKey(account: ReplyAccount, chatId: string) {
  return createHash("sha256").update(`${account}:${chatId}`).digest("hex");
}

async function lockThread(tx: Transaction, id: string) {
  await tx.$queryRaw`SELECT id FROM wa_reply_threads WHERE id = ${id} FOR UPDATE`;
  return tx.waReplyThread.findUniqueOrThrow({ where: { id } });
}

async function ensureThread(tx: Transaction, account: ReplyAccount, chatId: string) {
  const id = threadKey(account, chatId);
  // Use the existing row lock to serialize replies for a chat across requests and workers.
  await tx.$executeRaw`
    INSERT INTO wa_reply_threads (id, account, chatId) VALUES (${id}, ${account}, ${chatId})
    ON DUPLICATE KEY UPDATE id = id
  `;
  return tx.waReplyThread.findUniqueOrThrow({ where: { id } });
}

async function activeDraft(tx: Transaction, thread: WaReplyThread) {
  return thread.activeDraftId
    ? tx.waReplyDraft.findUnique({ where: { id: thread.activeDraftId } })
    : null;
}

async function discardActiveDraft(tx: Transaction, thread: WaReplyThread, draft: WaReplyDraft) {
  await tx.waReplyEvent.updateMany({ where: { threadId: thread.id }, data: { body: null } });
  await tx.waReplyDraft.update({
    where: { id: draft.id },
    data: {
      status: "skipped",
      readyAt: null,
      body: null,
      summary: null,
      nextAttempt: null,
      claim: null,
      revision: { increment: 1 },
    },
  });
  await tx.waReplyThread.update({ where: { id: thread.id }, data: { activeDraftId: null } });
}

async function queueDraft(tx: Transaction, thread: WaReplyThread, context: DraftContext, draft: WaReplyDraft | null) {
  const newest = await tx.waReplyEvent.findFirst({
    where: { threadId: thread.id, body: { not: null } },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  if (!newest) return;

  const fields = {
    ...context,
    status: "pending",
    sourceAt: newest.receivedAt,
    nextAttempt: new Date(Date.now() + DEBOUNCE_MS),
    readyAt: draft?.readyAt ?? null,
    claim: null,
    body: draft?.body ?? null,
    summary: draft?.summary ?? null,
    attempts: 0,
  };
  if (draft) {
    await tx.waReplyDraft.update({
      where: { id: draft.id },
      data: { ...fields, revision: { increment: 1 } },
    });
    return;
  }
  const created = await tx.waReplyDraft.create({
    data: { ...fields, account: thread.account, threadId: thread.id },
  });
  await tx.waReplyThread.update({ where: { id: thread.id }, data: { activeDraftId: created.id } });
}

async function settleThrough(
  tx: Transaction,
  thread: WaReplyThread,
  cutoff: Date,
  status: "answered" | "sent",
  providerMessageId?: string,
) {
  if (thread.lastReplyAt && cutoff <= thread.lastReplyAt) return;
  await tx.waReplyThread.update({ where: { id: thread.id }, data: { lastReplyAt: cutoff } });
  const consumed = await tx.waReplyEvent.updateMany({
    where: { threadId: thread.id, receivedAt: { lte: cutoff }, body: { not: null } },
    data: { body: null },
  });
  const draft = await activeDraft(tx, thread);
  if (!draft || !consumed.count) return;
  const context: DraftContext = {
    ownerUserId: draft.ownerUserId,
    conversationId: draft.conversationId,
    mauticContactId: draft.mauticContactId,
    recipientName: draft.recipientName,
  };

  // A draft with a newer source is invalidated only if its context actually changed.
  if (draft.sourceAt > cutoff && !["sending", "uncertain"].includes(draft.status)) {
    await queueDraft(tx, thread, context, draft);
    return;
  }
  if (draft.sourceAt > cutoff) return;

  await tx.waReplyDraft.update({
    where: { id: draft.id },
    data: {
      status,
      revision: { increment: 1 },
      readyAt: null,
      body: null,
      summary: null,
      nextAttempt: null,
      claim: null,
      ...(status === "sent" ? { sentAt: new Date(), providerMessageId } : {}),
    },
  });
  await tx.waReplyThread.update({ where: { id: thread.id }, data: { activeDraftId: null } });
  await queueDraft(tx, thread, context, null);
}

async function resolveChat(account: ReplyAccount, event: WahaReplyEvent): Promise<string | undefined> {
  if (event.chatId) return event.chatId;
  if (!event.lid) return undefined;
  const thread = await prisma.waReplyThread.findUnique({
    where: { account_lid: { account, lid: event.lid } },
    select: { chatId: true },
  });
  return thread?.chatId;
}

export async function matchPersonalWhatsAppContact(chatId: string) {
  const phone = "+" + chatId.split("@")[0];
  const found = await searchContactByPhone(phone, true);
  if (!found?.id) return null;
  const details = await getContactFull(found.id, AbortSignal.timeout(5000));
  if (!details) throw new Error("Mautic-contactcontrole niet beschikbaar");
  const exclusion = (process.env.WHATSAPP_REPLY_PERSONAL_EXCLUSION_TAG ||
    "whatsapp-persoonlijk-uitsluiten").toLowerCase();
  const matches = [details.phone, details.mobile].some((candidate) => {
    if (!candidate) return false;
    const jid = toWhatsAppJid(candidate);
    return jid && normalizeReplyChatId(jid) === chatId;
  });
  if (!matches || details.id !== found.id || details.tags.some((tag) => tag?.toLowerCase() === exclusion)) {
    return null;
  }
  return { id: details.id, name: [details.firstname, details.lastname].filter(Boolean).join(" ") };
}

export async function processWahaReplyEvent(
  account: ReplyAccount,
  event: WahaReplyEvent,
  office?: { id: string; waName: string | null; mauticContactId: number | null },
) {
  if (!isWhatsAppReplyEnabled(account) || event.type === "api") return;
  const chatId = await resolveChat(account, event);
  if (!chatId) return;
  const ownerUserId = account === "personal" ? process.env.WHATSAPP_REPLY_OWNER_USER_ID! : null;
  const contact = account === "personal"
    ? await matchPersonalWhatsAppContact(chatId)
    : null;
  if (account === "personal" && !contact) {
    await discardPendingWhatsAppReply(threadKey("personal", chatId));
    return;
  }

  const context: DraftContext = {
    ownerUserId,
    conversationId: office?.id ?? null,
    mauticContactId: contact?.id ?? office?.mauticContactId ?? null,
    recipientName: (contact?.name || office?.waName)?.slice(0, 191) ?? null,
  };
  await prisma.$transaction(async (tx) => {
    // An outgoing event may beat the incoming webhook. Its timestamp must still be retained.
    const thread = await ensureThread(tx, account, chatId);
    if (event.lid && event.chatId) {
      const known = await tx.waReplyThread.findUnique({
        where: { account_lid: { account, lid: event.lid } },
        select: { id: true },
      });
      if (!known || known.id === thread.id) {
        await tx.waReplyThread.update({ where: { id: thread.id }, data: { lid: event.lid } });
      }
    }
    if (event.type === "manual") {
      const quoted = event.quotedMessageId
        ? await tx.waReplyEvent.findUnique({
            where: { threadId_providerMessageId: { threadId: thread.id, providerMessageId: event.quotedMessageId } },
            select: { receivedAt: true },
          })
        : null;
      if (event.quotedMessageId && !quoted) {
        // Remember the exact source if WAHA delivers the quote before its inbound message.
        await tx.waReplyEvent.create({
          data: {
            threadId: thread.id,
            providerMessageId: event.quotedMessageId,
            receivedAt: manualReplyCutoff(event.occurredAt),
          },
        });
      }
      await settleThrough(tx, thread, manualReplyCutoff(event.occurredAt, quoted?.receivedAt), "answered");
      return;
    }
    if (!event.body || (thread.lastReplyAt && event.occurredAt <= thread.lastReplyAt)) return;
    const existing = await tx.waReplyEvent.findUnique({
      where: { threadId_providerMessageId: { threadId: thread.id, providerMessageId: event.providerMessageId } },
      select: { id: true },
    });
    if (existing) return;
    let draft = await activeDraft(tx, thread);
    if (draft && account === "personal" && (
      draft.ownerUserId !== ownerUserId || draft.mauticContactId !== contact?.id
    )) {
      await discardActiveDraft(tx, thread, draft);
      draft = null;
    }
    await tx.waReplyEvent.create({
      data: {
        threadId: thread.id,
        providerMessageId: event.providerMessageId,
        receivedAt: event.occurredAt,
        body: event.body,
      },
    });
    if (draft?.status === "sending") return;
    if (draft?.status === "uncertain") {
      await queueAfterUncertainSend(tx, thread, draft);
      return;
    }
    await queueDraft(tx, thread, context, draft);
  });
}

async function queueAfterUncertainSend(tx: Transaction, thread: WaReplyThread, draft: WaReplyDraft) {
  // The previous send cannot be retried. A later inbound deserves its own concept.
  const hasLaterInbound = await tx.waReplyEvent.findFirst({
    where: { threadId: thread.id, receivedAt: { gt: draft.sourceAt }, body: { not: null } },
    select: { id: true },
  });
  if (!hasLaterInbound) return;
  await tx.waReplyEvent.updateMany({
    where: { threadId: thread.id, receivedAt: { lte: draft.sourceAt }, body: { not: null } },
    data: { body: null },
  });
  if (!thread.lastReplyAt || thread.lastReplyAt < draft.sourceAt) {
    await tx.waReplyThread.update({ where: { id: thread.id }, data: { lastReplyAt: draft.sourceAt } });
  }
  await tx.waReplyDraft.update({
    where: { id: draft.id },
    data: { body: null, summary: null, readyAt: null },
  });
  await queueDraft(tx, thread, {
    ownerUserId: draft.ownerUserId,
    conversationId: draft.conversationId,
    mauticContactId: draft.mauticContactId,
    recipientName: draft.recipientName,
  }, null);
}

export async function recoverUncertainWhatsAppReply(
  draft: Pick<WaReplyDraft, "id" | "threadId">,
  statusForRejectedSend?: "failed" | "uncertain",
  claim?: string,
) {
  await prisma.$transaction(async (tx) => {
    const thread = await lockThread(tx, draft.threadId);
    const current = await activeDraft(tx, thread);
    if (!current || current.id !== draft.id || current.status !== "sending") return;
    if (claim ? current.claim !== claim : !current.nextAttempt || current.nextAttempt > new Date()) return;
    const status = statusForRejectedSend ?? "uncertain";
    const saved = await tx.waReplyDraft.update({
      where: { id: draft.id },
      data: { status, claim: null, nextAttempt: null, revision: { increment: 1 } },
    });
    if (status === "uncertain") await queueAfterUncertainSend(tx, thread, saved);
  });
}

export async function discardPendingWhatsAppReply(
  threadId: string,
  expected?: { id: string; claim?: string; revision?: number },
) {
  const ref = await prisma.waReplyThread.findUnique({ where: { id: threadId }, select: { id: true } });
  if (!ref) return;
  await prisma.$transaction(async (tx) => {
    const thread = await lockThread(tx, threadId);
    const draft = await activeDraft(tx, thread);
    if (draft && (!expected || (
      draft.id === expected.id &&
      (!expected.claim || draft.claim === expected.claim) &&
      (expected.revision === undefined || draft.revision === expected.revision)
    ))) await discardActiveDraft(tx, thread, draft);
  });
}

export async function closeOfficeWhatsAppReplyDraft(waPhone: string, coveredThrough: Date) {
  if (!isWhatsAppReplyEnabled("office")) return;
  const chatId = normalizeReplyChatId(waPhone);
  if (!chatId) return;
  await prisma.$transaction(async (tx) => {
    const thread = await ensureThread(tx, "office", chatId);
    await settleThrough(tx, thread, coveredThrough, "answered");
  });
}

export async function listWhatsAppReplyDraftMessages(draft: Pick<WaReplyDraft, "threadId" | "sourceAt">) {
  const latest = await prisma.waReplyEvent.findMany({
    where: {
      threadId: draft.threadId,
      body: { not: null },
      receivedAt: { gte: new Date(draft.sourceAt.getTime() - DRAFT_AGE_MS), lte: draft.sourceAt },
    },
    select: { id: true, body: true, receivedAt: true },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: MAX_SOURCE_MESSAGES,
  });
  return latest.reverse().flatMap((message) =>
    message.body ? [{ ...message, body: message.body, direction: "inbound" as const }] : [],
  );
}

function validatedBody(body: unknown) {
  if (typeof body !== "string" || !body.trim() || body.length > WHATSAPP_REPLY_TEXT_LIMIT) {
    throw new WhatsAppReplyError("Vul een WhatsApp-antwoord van maximaal 4000 tekens in.", 400);
  }
  return body.trim();
}

async function lockAction(
  tx: Transaction,
  threadId: string,
  id: string,
  revision: number,
  actorUserId: string,
  canEditPending = false,
) {
  const thread = await lockThread(tx, threadId);
  const draft = await tx.waReplyDraft.findUniqueOrThrow({ where: { id } });
  if (!canAccessWhatsAppReplyDraft(draft, actorUserId)) throw new WhatsAppReplyError("Concept niet gevonden.", 404);
  const allowed = canEditPending ? ["pending", "ready", "failed"] : ["ready", "failed"];
  if (thread.activeDraftId !== id || draft.revision !== revision || !allowed.includes(draft.status) || !draft.body) {
    throw new WhatsAppReplyError("Dit concept is gewijzigd of al afgehandeld.", 409);
  }
  return { draft, thread };
}

export async function editWhatsAppReplyDraft(
  id: string,
  revision: number,
  body: unknown,
  actorUserId: string,
) {
  const text = validatedBody(body);
  const ref = await prisma.waReplyDraft.findUnique({ where: { id }, select: { threadId: true } });
  if (!ref) throw new WhatsAppReplyError("Concept niet gevonden.", 404);
  return prisma.$transaction(async (tx) => {
    const { draft } = await lockAction(tx, ref.threadId, id, revision, actorUserId, true);
    return tx.waReplyDraft.update({
      where: { id },
      data: {
        body: text,
        edited: true,
        revision: { increment: 1 },
        ...(draft.status === "pending" ? { claim: null, nextAttempt: new Date(Date.now() + DEBOUNCE_MS) } : {}),
      },
    });
  });
}

async function persistOfficeReply(draft: WaReplyDraft, providerMessageId: string, body: string) {
  if (!draft.conversationId) return;
  await prisma.waMessage.upsert({
    where: { evolutionMsgId: providerMessageId },
    create: {
      conversationId: draft.conversationId,
      direction: "OUTBOUND",
      body,
      deliveryStatus: "SENT",
      evolutionMsgId: providerMessageId,
    },
    update: {},
  });
  await prisma.waConversation.update({
    where: { id: draft.conversationId },
    data: { lastMessageAt: new Date() },
  });
}

export async function sendWhatsAppReplyDraft(
  id: string,
  revision: number,
  body: unknown,
  actorUserId: string,
) {
  const text = validatedBody(body);
  const access = await prisma.waReplyDraft.findUnique({
    where: { id },
    include: { thread: { select: { chatId: true } } },
  });
  if (!access || !canAccessWhatsAppReplyDraft(access, actorUserId)) {
    throw new WhatsAppReplyError("Concept niet gevonden.", 404);
  }
  if (access.account === "personal") {
    const contact = await matchPersonalWhatsAppContact(access.thread.chatId).catch(() => {
      throw new WhatsAppReplyError("Mautic-contactcontrole tijdelijk niet beschikbaar.", 503);
    });
    if (!contact || contact.id !== access.mauticContactId) {
      await discardPendingWhatsAppReply(access.threadId, { id, revision });
      throw new WhatsAppReplyError("Dit contact komt niet meer in aanmerking voor WhatsApp-opvolging.", 409);
    }
  }
  const claim = randomUUID();
  const { draft, thread } = await prisma.$transaction(async (tx) => {
    const result = await lockAction(tx, access.threadId, id, revision, actorUserId);
    await tx.waReplyDraft.update({
      where: { id },
      data: { body: text, status: "sending", claim, nextAttempt: new Date(Date.now() + SEND_LEASE_MS) },
    });
    return result;
  });

  let providerMessageId: string | null;
  try {
    providerMessageId = draft.account === "personal"
      ? await sendPersonalWhatsAppMessage(thread.chatId, text)
      : await sendWhatsAppMessage(thread.chatId, text);
    if (!providerMessageId) throw new Error("Geen WhatsApp-bericht-ID");
  } catch (error) {
    const rejected = error instanceof WhatsAppError &&
      error.status !== undefined && [400, 401, 403, 404, 422, 429].includes(error.status);
    await recoverUncertainWhatsAppReply(draft, rejected ? "failed" : "uncertain", claim);
    throw new WhatsAppReplyError(
      rejected ? "WhatsApp heeft de verzending geweigerd." : "Controleer in WhatsApp of je bericht is verzonden.",
      rejected ? 502 : 503,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await lockThread(tx, thread.id);
    const saved = await tx.waReplyDraft.findUniqueOrThrow({ where: { id } });
    if (draft.mauticContactId) {
      const hashes = [...sentPageHashes(text), ...await sentMarketHashes(tx, text)];
      const data = hashes.map(pageHash => ({ contactId: draft.mauticContactId!, pageHash }));
      if (data.length) await tx.waSharedPage.createMany({ data, skipDuplicates: true });
    }
    if (current.activeDraftId === id && saved.claim === claim) {
      await settleThrough(tx, current, draft.sourceAt, "sent", providerMessageId);
    }
    return tx.waReplyDraft.findUniqueOrThrow({ where: { id } });
  });
  if (draft.account === "office") {
    await persistOfficeReply(draft, providerMessageId, text).catch(() => {
      console.error("WhatsApp-kantoorantwoord kon niet direct in de inbox worden bijgewerkt");
    });
  }
  return result;
}
