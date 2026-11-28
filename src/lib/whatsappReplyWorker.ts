import { randomUUID } from "node:crypto";
import type { WaReplyDraft } from "@prisma/client";
import { prisma } from "./prisma";
import {
  discardPendingWhatsAppReply,
  listWhatsAppReplyDraftMessages,
  matchPersonalWhatsAppContact,
  recoverUncertainWhatsAppReply,
} from "./whatsappReplies";
import { isWhatsAppReplyEnabled } from "./whatsappReplyEvents";
import { generateWhatsAppReplySuggestion, selectWhatsAppReplyGenerator } from "./whatsappReplyGenerator";

import { replyResources } from "./whatsappRecommendationContext";

const POLL_MS = 3000;
const CLAIM_MS = 90_000;
const MAX_ATTEMPTS = 3;
const DRAFT_AGE_MS = 24 * 60 * 60 * 1000;
const META_RETENTION_MS = 30 * DRAFT_AGE_MS;

async function previousOfficeMessage(draft: WaReplyDraft, firstInboundAt: Date) {
  if (draft.account !== "office" || !draft.conversationId) return undefined;
  const message = await prisma.waMessage.findFirst({
    where: {
      conversationId: draft.conversationId,
      direction: "OUTBOUND",
      deliveryStatus: { in: ["SENT", "DELIVERED", "READ"] },
      createdAt: { lt: firstInboundAt },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { body: true },
  }).catch(() => null);
  const text = message?.body.trim();
  return text && !/^\[(?:audio|media|sticker|document|bericht)\b/i.test(text) ? text.slice(0, 1000) : undefined;
}

async function generate(draft: WaReplyDraft, generator: NonNullable<ReturnType<typeof selectWhatsAppReplyGenerator>>) {
  const now = new Date();
  const claim = randomUUID();
  const eligible = { id: draft.id, revision: draft.revision, status: "pending" };
  const acquired = await prisma.waReplyDraft.updateMany({
    where: { ...eligible, nextAttempt: { lte: now } },
    data: { claim, nextAttempt: new Date(now.getTime() + CLAIM_MS), attempts: { increment: 1 } },
  });
  if (!acquired.count) return;

  const attempt = draft.attempts + 1;
  const owned = { ...eligible, claim };
  try {
    if (draft.account === "personal") {
      const thread = await prisma.waReplyThread.findUniqueOrThrow({
        where: { id: draft.threadId },
        select: { chatId: true },
      });
      const contact = await matchPersonalWhatsAppContact(thread.chatId);
      if (!contact || contact.id !== draft.mauticContactId) {
        await discardPendingWhatsAppReply(draft.threadId, { id: draft.id, claim });
        return;
      }
    }
    const messages = await listWhatsAppReplyDraftMessages(draft);
    if (!messages.length) {
      await discardPendingWhatsAppReply(draft.threadId, { id: draft.id, claim });
      return;
    }
    const previous = await previousOfficeMessage(draft, messages[0].receivedAt);
    const inbound = messages.map(message => message.body);
    const resources = await replyResources(draft, inbound, previous).catch(() => {
      console.warn("Bronnen voor WhatsApp-aanbevelingen tijdelijk onvolledig");
      return { homes: [], pages: [] };
    });
    const current = await prisma.waReplyDraft.findFirst({ where: owned, select: { id: true } });
    if (!current) return;
    const suggestion = await generateWhatsAppReplySuggestion(generator, {
      inbound, resources,
      previousOfficeMessage: previous,
    });
    const body = draft.edited && draft.body ? draft.body : suggestion.body;
    if (!body) {
      await discardPendingWhatsAppReply(draft.threadId, { id: draft.id, claim });
      return;
    }
    await prisma.waReplyDraft.updateMany({
      where: owned,
      data: {
        status: "ready",
        revision: { increment: 1 },
        body,
        summary: suggestion.summary || null,
        readyAt: draft.readyAt ?? new Date(),
        claim: null,
        nextAttempt: null,
      },
    });
  } catch {
    const updated = await prisma.waReplyDraft.updateMany({
      where: owned,
      data: {
        claim: null,
        attempts: attempt < MAX_ATTEMPTS ? attempt : 0,
        nextAttempt: new Date(Date.now() + (attempt < MAX_ATTEMPTS ? 30_000 * attempt : 15 * 60_000)),
      },
    });
    if (updated.count) console.error("WhatsApp-conceptgeneratie tijdelijk mislukt");
  }
}

export async function processWhatsAppReplyDrafts() {
  const accounts = (["office", "personal"] as const).filter(isWhatsAppReplyEnabled);
  if (!accounts.length) return;
  const now = new Date();
  const interrupted = await prisma.waReplyDraft.findMany({
    where: { account: { in: accounts }, status: "sending", nextAttempt: { lte: now } },
    select: { id: true, threadId: true },
    take: 30,
  });
  for (const draft of interrupted) await recoverUncertainWhatsAppReply(draft);
  const old = await prisma.waReplyDraft.findMany({
    where: {
      account: { in: accounts },
      status: { in: ["pending", "ready", "failed", "uncertain"] },
      sourceAt: { lt: new Date(now.getTime() - DRAFT_AGE_MS) },
    },
    select: { id: true, threadId: true, revision: true },
    take: 30,
  });
  for (const draft of old) {
    await discardPendingWhatsAppReply(draft.threadId, { id: draft.id, revision: draft.revision });
  }
  if (old.length) {
    await prisma.waReplyDraft.updateMany({
      where: {
        account: { in: accounts },
        status: "uncertain",
        body: null,
        sourceAt: { lt: new Date(now.getTime() - DRAFT_AGE_MS) },
      },
      data: { status: "skipped" },
    });
  }
  if (old.length || now.getMinutes() === 0) {
    await prisma.waReplyEvent.deleteMany({
      where: { body: null, receivedAt: { lt: new Date(now.getTime() - META_RETENTION_MS) } },
    });
  }

  const generators = new Map(accounts.flatMap((account) => {
    const generator = selectWhatsAppReplyGenerator(account);
    return generator ? [[account, generator] as const] : [];
  }));
  if (!generators.size) return;
  const jobs = await prisma.waReplyDraft.findMany({
    where: {
      OR: [...generators.keys()].map((account) => account === "personal"
        ? { account, ownerUserId: process.env.WHATSAPP_REPLY_OWNER_USER_ID }
        : { account }),
      status: "pending",
      nextAttempt: { lte: now },
    },
    orderBy: { nextAttempt: "asc" },
    take: 3,
  });
  await Promise.allSettled(jobs.map((draft) => {
    if (draft.account !== "office" && draft.account !== "personal") return;
    const generator = generators.get(draft.account);
    return generator && generate(draft, generator);
  })).then((results) => {
    if (results.some((result) => result.status === "rejected")) {
      console.error("WhatsApp-conceptwerk kon niet volledig worden verwerkt");
    }
  });
}

let running = false;
let started = false;

export function startWhatsAppReplyWorker() {
  if (started) return;
  started = true;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await processWhatsAppReplyDrafts();
    } catch {
      console.error("WhatsApp-conceptwerk tijdelijk niet beschikbaar");
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(() => void run(), POLL_MS).unref();
}
