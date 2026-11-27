import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import type { WaDraftPushDevice, WaWebPushDevice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessOfficeFollowup, canEditOfficeFollowup, officeFollowupInclude, officeFollowupOpenWhere, officeFollowupSummary } from "@/lib/whatsappOfficeFollowup";
import { safeWhatsAppReplySummary } from "@/lib/whatsappReplyGenerator";
import { whatsappPushPayload } from "@/lib/whatsappPushPayload";
import { sendWhatsAppWebPush, type WhatsAppPushResult } from "@/lib/whatsappWebPush";
import { webPushConfig } from "@/lib/whatsappWebPushConfig";

const day = 24 * 60 * 60 * 1000;
const maxAttempts = 4;
const providerTimeout = 8_000;
const pollingInterval = 5_000;

type Candidate = {
  id: string;
  at: Date;
  account: string;
  ownerUserId: string | null;
  recipient: string | null;
  summary: string;
  officePurpose?: string;
};
type Device = Pick<WaDraftPushDevice, "id" | "userId" | "officeSince" | "personalSince">;
type ActiveDevice = Device & { email: string };
type TicketLease = { id: string; state: string; nextTry: Date };
type NewTicket = { deviceId: string; draftRef: string };
type Ticket = TicketLease & NewTicket & { attempts: number };
type TicketUpdate = { state?: string; nextTry?: Date; attempts?: { increment: number } | { decrement: number } };

type DeliveryQueue = {
  createMany(args: { data: NewTicket[]; skipDuplicates: true }): PromiseLike<unknown>;
  deleteMany(args: { where: { createdAt: { lt: Date } } }): PromiseLike<unknown>;
  findMany(args: {
    where: { state: { in: string[] }; nextTry: { lte: Date }; createdAt: { gte: Date } };
    orderBy: { nextTry: "asc" };
    take: number;
  }): PromiseLike<Ticket[]>;
  updateMany(args: { where: TicketLease; data: TicketUpdate }): PromiseLike<{ count: number }>;
};

type Transport<D extends Device> = {
  name: string;
  queue: DeliveryQueue;
  optedInDevices(): PromiseLike<D[]>;
  device(id: string): PromiseLike<D | null>;
  invalidate(device: D): PromiseLike<unknown>;
  send(device: D, candidate: Candidate): Promise<WhatsAppPushResult>;
};

const deviceOptedIn = { OR: [{ officeSince: { not: null } }, { personalSince: { not: null } }] };

function candidatePreview(draft: Candidate) {
  return [draft.recipient?.trim(), draft.summary.trim()].filter(Boolean).join(" · ");
}

function apnsConfig() {
  const team = process.env.WHATSAPP_APNS_TEAM_ID;
  const keyId = process.env.WHATSAPP_APNS_KEY_ID;
  const key = process.env.WHATSAPP_APNS_KEY_BASE64;
  const topic = process.env.WHATSAPP_APNS_TOPIC;
  return team && keyId && key && topic ? { team, keyId, key, topic } : null;
}

let cachedAuth: { configuration: string; jwt: string; expires: number } | undefined;

function apnsAuth(config: NonNullable<ReturnType<typeof apnsConfig>>) {
  const now = Math.floor(Date.now() / 1000);
  const configuration = `${config.team}/${config.keyId}`;
  if (cachedAuth?.configuration === configuration && cachedAuth.expires > now) return cachedAuth.jwt;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: config.team, iat: now })).toString("base64url");
  const contents = `${header}.${claims}`;
  const key = createPrivateKey(Buffer.from(config.key, "base64"));
  const signature = sign("sha256", Buffer.from(contents), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  cachedAuth = { configuration, jwt: `${contents}.${signature}`, expires: now + 40 * 60 };
  return cachedAuth.jwt;
}

function sendToApns(config: NonNullable<ReturnType<typeof apnsConfig>>, device: WaDraftPushDevice, draft: Candidate) {
  const auth = apnsAuth(config);
  const copy = Array.from(candidatePreview(draft)).slice(0, 145).join("");
  const payload = whatsappPushPayload(draft.id, copy, device.publicKey);
  const host = device.environment === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  return new Promise<WhatsAppPushResult>((resolve, reject) => {
    const session = connect(`https://${host}`);
    const timeout = setTimeout(() => session.destroy(new Error("APNs time-out")), providerTimeout);
    const finish = () => { clearTimeout(timeout); session.close(); };
    session.once("error", (error) => { finish(); reject(error); });
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${device.token}`,
      authorization: `bearer ${auth}`,
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "apns-collapse-id": draft.id,
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 5 * 60),
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    request.setEncoding("utf8");
    request.once("response", (headers) => { status = Number(headers[":status"]); });
    request.on("data", (chunk: string) => { if (body.length < 400) body += chunk; });
    request.once("end", () => {
      finish();
      let reason;
      try { reason = JSON.parse(body).reason; } catch { /* APNs success has no body. */ }
      resolve({ status, invalid: status === 410 || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic" });
    });
    request.once("error", (error) => { finish(); reject(error); });
    request.end(payload);
  });
}

function apnsTransport(config: NonNullable<ReturnType<typeof apnsConfig>>): Transport<WaDraftPushDevice> {
  return {
    name: "APNs",
    queue: prisma.waDraftPushDelivery,
    optedInDevices: () => prisma.waDraftPushDevice.findMany({ where: deviceOptedIn }),
    device: (id) => prisma.waDraftPushDevice.findUnique({ where: { id } }),
    invalidate: ({ id, token, updatedAt }) => prisma.waDraftPushDevice.deleteMany({ where: { id, token, updatedAt } }),
    send: (device, draft) => sendToApns(config, device, draft),
  };
}

function browserTransport(config: NonNullable<ReturnType<typeof webPushConfig>>): Transport<WaWebPushDevice> {
  return {
    name: "Web Push",
    queue: prisma.waWebPushDelivery,
    optedInDevices: () => prisma.waWebPushDevice.findMany({ where: deviceOptedIn }),
    device: (id) => prisma.waWebPushDevice.findUnique({ where: { id } }),
    invalidate: ({ id, endpointHash, updatedAt }) => prisma.waWebPushDevice.deleteMany({ where: { id, endpointHash, updatedAt } }),
    send: (device, draft) => sendWhatsAppWebPush(config, device, { draft: draft.id, body: candidatePreview(draft) }),
  };
}

function replyCandidate(row: {
  id: string; readyAt: Date | null; account: string; ownerUserId: string | null; recipientName: string | null; summary: string | null;
}): Candidate | null {
  if (!row.readyAt) return null;
  if (row.account === "personal" && (
    process.env.WHATSAPP_REPLY_PERSONAL_ENABLED !== "1" ||
    !row.ownerUserId || row.ownerUserId !== process.env.WHATSAPP_REPLY_OWNER_USER_ID
  )) return null;
  if (row.account === "office" && process.env.WHATSAPP_REPLY_OFFICE_ENABLED !== "1") return null;
  return {
    id: `reply-${row.id}`, at: row.readyAt, account: row.account, ownerUserId: row.ownerUserId,
    recipient: row.recipientName, summary: safeWhatsAppReplySummary(row.summary),
  };
}

function followupCandidate(row: Parameters<typeof officeFollowupSummary>[0]): Candidate {
  return {
    id: `followup-${row.id}`, at: row.createdAt, account: "office", ownerUserId: null,
    recipient: row.recipientName, summary: officeFollowupSummary(row), officePurpose: row.purpose,
  };
}

function enabledFor(device: ActiveDevice, candidate: Candidate) {
  if (candidate.account === "personal") {
    return device.userId === candidate.ownerUserId && !!device.personalSince && candidate.at > device.personalSince;
  }
  return candidate.account === "office" && !!device.officeSince && candidate.at > device.officeSince &&
    (!candidate.officePurpose || canAccessOfficeFollowup(candidate.officePurpose, device.email));
}

async function loadCandidates(since: Date) {
  const [replies, followups] = await Promise.all([
    prisma.waReplyDraft.findMany({ where: { status: "ready", readyAt: { gte: since } } }),
    prisma.followUpDraft.findMany({
      where: { AND: [officeFollowupOpenWhere, { createdAt: { gte: since }, status: { in: ["draft", "approved"] } }] },
      include: officeFollowupInclude,
    }),
  ]);
  const candidates = replies.map(replyCandidate).filter((candidate): candidate is Candidate => candidate !== null);
  for (const row of followups) {
    if (canEditOfficeFollowup(row) && row.recipientPhone) candidates.push(followupCandidate(row));
  }
  return candidates;
}

async function materialize(queue: DeliveryQueue, devices: ActiveDevice[], candidates: Candidate[]) {
  const tickets = candidates.flatMap((draft) =>
    devices.filter((device) => enabledFor(device, draft)).map((device) => ({ deviceId: device.id, draftRef: draft.id })),
  );
  if (tickets.length) await queue.createMany({ data: tickets, skipDuplicates: true });
}

async function latestCandidate(device: ActiveDevice, ref: string) {
  if (ref.startsWith("reply-")) {
    const draft = await prisma.waReplyDraft.findUnique({ where: { id: ref.slice(6) } });
    const candidate = draft && replyCandidate(draft);
    if (!candidate || !enabledFor(device, candidate)) return null;
    if (draft?.status === "pending") return "pending" as const;
    return draft?.status === "ready" ? candidate : null;
  }
  if (!ref.startsWith("followup-")) return null;
  const draft = await prisma.followUpDraft.findFirst({
    where: { id: ref.slice(9), channel: "whatsapp", status: { in: ["draft", "approved"] } },
    include: officeFollowupInclude,
  });
  const candidate = draft && canEditOfficeFollowup(draft) && draft.recipientPhone ? followupCandidate(draft) : null;
  return candidate && enabledFor(device, candidate) ? candidate : null;
}

async function deliver<D extends Device>(transport: Transport<D>, cutoff: Date) {
  const now = new Date();
  const { queue } = transport;
  const pending = await queue.findMany({
    where: { state: { in: ["pending", "sending"] }, nextTry: { lte: now }, createdAt: { gte: cutoff } },
    orderBy: { nextTry: "asc" }, take: 20,
  });
  for (const ticket of pending) {
    const nextTry = new Date(Date.now() + 60_000);
    const claim = await queue.updateMany({
      where: { id: ticket.id, state: ticket.state, nextTry: ticket.nextTry },
      data: { state: "sending", nextTry, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;

    // Resolve the recipient and status again immediately before sending.
    const device = await transport.device(ticket.deviceId);
    const user = device ? await prisma.user.findUnique({
      where: { id: device.userId }, select: { email: true, active: true },
    }) : null;
    const active = device && user?.active ? { ...device, email: user.email } : null;
    const candidate = active && await latestCandidate(active, ticket.draftRef);
    const ticketWhere = { id: ticket.id, state: "sending", nextTry };
    if (candidate === "pending") {
      await queue.updateMany({
        where: ticketWhere, data: { state: "pending", nextTry: new Date(Date.now() + pollingInterval), attempts: { decrement: 1 } },
      });
      continue;
    }
    if (!active || !candidate || !enabledFor(active, candidate)) {
      await queue.updateMany({ where: ticketWhere, data: { state: "cancelled" } });
      continue;
    }
    const sent = await transport.send(active, candidate).catch(() => ({ status: 0, invalid: false }));
    if (sent.invalid) {
      await transport.invalidate(active);
      // A registration can change while the old credential is in flight. The
      // deletion cascades normally; if it lost that race, leave a retryable row.
      await queue.updateMany({ where: ticketWhere, data: { state: "pending" } });
    } else if (sent.status >= 200 && sent.status < 300) {
      await queue.updateMany({ where: ticketWhere, data: { state: "sent" } });
    } else if (([0, 429].includes(sent.status) || sent.status >= 500) && ticket.attempts + 1 < maxAttempts) {
      await queue.updateMany({
        where: ticketWhere, data: { state: "pending", nextTry: new Date(Date.now() + 20_000 * (2 ** ticket.attempts)) },
      });
    } else {
      await queue.updateMany({ where: ticketWhere, data: { state: "failed" } });
      console.warn("[whatsapp-draft-push] Delivery failed", transport.name, sent.status);
    }
  }
}

const lastCleanup = new Map<string, number>();

async function runTransport<D extends Device>(
  transport: Transport<D>,
  candidates: () => Promise<Candidate[]>,
  cutoff: Date,
) {
  const now = Date.now();
  if (now - (lastCleanup.get(transport.name) ?? 0) > day) {
    await transport.queue.deleteMany({ where: { createdAt: { lt: new Date(now - 7 * day) } } });
    lastCleanup.set(transport.name, now);
  }
  const devices = await transport.optedInDevices();
  if (devices.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(devices.map(({ userId }) => userId))] }, active: true },
      select: { id: true, email: true },
    });
    const emails = new Map(users.map(({ id, email }) => [id, email]));
    const active = devices.flatMap((device) => {
      const email = emails.get(device.userId);
      return email ? [{ ...device, email }] : [];
    });
    if (active.length) await materialize(transport.queue, active, await candidates());
  }
  await deliver(transport, cutoff);
}

export async function runWhatsAppDraftPushWorker() {
  const native = apnsConfig();
  const browser = webPushConfig();
  const cutoff = new Date(Date.now() - day);
  let loaded: Promise<Candidate[]> | undefined;
  const candidates = () => loaded ??= loadCandidates(cutoff);
  const runs = [];
  if (native) runs.push(runTransport(apnsTransport(native), candidates, cutoff));
  if (browser) runs.push(runTransport(browserTransport(browser), candidates, cutoff));
  const results = await Promise.allSettled(runs);
  if (results.some(({ status }) => status === "rejected")) throw new Error("WhatsApp push transport failed");
}

let running = false;

export function startWhatsAppDraftPushWorker() {
  if (running) return;
  running = true;
  if (!apnsConfig() && !webPushConfig()) {
    console.warn("[whatsapp-draft-push] No push transport configured");
    return;
  }
  async function tick() {
    try { await runWhatsAppDraftPushWorker(); }
    catch { console.error("[whatsapp-draft-push] Push worker failed"); }
    setTimeout(tick, pollingInterval).unref();
  }
  void tick();
}
