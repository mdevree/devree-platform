import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import type { WaDraftPushDevice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessOfficeFollowup, canEditOfficeFollowup, officeFollowupInclude, officeFollowupOpenWhere, officeFollowupSummary } from "@/lib/whatsappOfficeFollowup";
import { whatsappPushPayload } from "@/lib/whatsappPushPayload";

const day = 24 * 60 * 60 * 1000;
const maxAttempts = 4;
const providerTimeout = 8_000;
const pollingInterval = 5_000;

type Candidate = { id: string; at: Date; account: string; ownerUserId: string | null; recipient: string | null; summary: string };
type ActiveDevice = WaDraftPushDevice & { email: string };

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

function sendToApns(config: NonNullable<ReturnType<typeof apnsConfig>>, device: ActiveDevice, draft: Candidate) {
  const auth = apnsAuth(config);
  const copy = [draft.recipient?.trim(), draft.summary.trim()].filter(Boolean).join(" · ");
  const payload = whatsappPushPayload(draft.id, Array.from(copy).slice(0, 145).join(""), device.publicKey);
  const host = device.environment === "development" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  return new Promise<{ status: number; reason?: string }>((resolve, reject) => {
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
      resolve({ status, reason });
    });
    request.once("error", (error) => { finish(); reject(error); });
    request.end(payload);
  });
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
    recipient: row.recipientName, summary: row.summary || "Vraagt om een antwoord op WhatsApp",
  };
}

function followupCandidate(row: Parameters<typeof officeFollowupSummary>[0]): Candidate {
  return {
    id: `followup-${row.id}`, at: row.createdAt, account: "office", ownerUserId: null,
    recipient: row.recipientName, summary: officeFollowupSummary(row),
  };
}

function enabledFor(device: ActiveDevice, candidate: Candidate) {
  const since = candidate.account === "office" ? device.officeSince : device.personalSince;
  return !!since && candidate.at > since &&
    (candidate.account === "office" || userOwnsPersonalDraft(device, candidate));
}

function userOwnsPersonalDraft(device: ActiveDevice, candidate: Candidate) {
  return candidate.account === "personal" && device.userId === candidate.ownerUserId;
}

async function materialize(devices: ActiveDevice[], since: Date) {
  const [replies, followups] = await Promise.all([
    prisma.waReplyDraft.findMany({ where: { status: "ready", readyAt: { gte: since } } }),
    prisma.followUpDraft.findMany({
      where: { AND: [officeFollowupOpenWhere, { createdAt: { gte: since }, status: { in: ["draft", "approved"] } }] },
      include: officeFollowupInclude,
    }),
  ]);
  const tickets = replies.flatMap((row) => {
    const candidate = replyCandidate(row);
    return candidate ? devices.filter((device) => enabledFor(device, candidate))
      .map((device) => ({ deviceId: device.id, draftRef: candidate.id })) : [];
  });
  for (const row of followups) {
    if (!canEditOfficeFollowup(row) || !row.recipientPhone) continue;
    const candidate = followupCandidate(row);
    for (const device of devices) {
      if (enabledFor(device, candidate) && canAccessOfficeFollowup(row.purpose, device.email)) {
        tickets.push({ deviceId: device.id, draftRef: candidate.id });
      }
    }
  }
  if (tickets.length) await prisma.waDraftPushDelivery.createMany({ data: tickets, skipDuplicates: true });
}

async function latestCandidate(device: ActiveDevice, ref: string) {
  if (ref.startsWith("reply-")) {
    const draft = await prisma.waReplyDraft.findUnique({ where: { id: ref.slice(6) } });
    const candidate = draft && replyCandidate(draft);
    if (!candidate || !enabledFor(device, candidate)) return null;
    if (draft?.status === "pending") return "pending" as const;
    return draft?.status === "ready" ? candidate : null;
  }
  const draft = await prisma.followUpDraft.findFirst({
    where: { id: ref.slice(9), channel: "whatsapp", status: { in: ["draft", "approved"] } },
    include: officeFollowupInclude,
  });
  return draft && canAccessOfficeFollowup(draft.purpose, device.email) && canEditOfficeFollowup(draft) && draft.recipientPhone
    ? followupCandidate(draft) : null;
}

async function deliver(config: NonNullable<ReturnType<typeof apnsConfig>>, cutoff: Date) {
  const now = new Date();
  const pending = await prisma.waDraftPushDelivery.findMany({
    where: { state: { in: ["pending", "sending"] }, nextTry: { lte: now }, createdAt: { gte: cutoff } },
    orderBy: { nextTry: "asc" }, take: 20,
  });
  for (const ticket of pending) {
    const nextTry = new Date(Date.now() + 60_000);
    const claim = await prisma.waDraftPushDelivery.updateMany({
      where: { id: ticket.id, state: ticket.state, nextTry: ticket.nextTry },
      data: { state: "sending", nextTry, attempts: { increment: 1 } },
    });
    if (!claim.count) continue;

    // Resolve the recipient and status again immediately before sending to Apple.
    const device = await prisma.waDraftPushDevice.findUnique({ where: { id: ticket.deviceId } });
    const user = device ? await prisma.user.findUnique({
      where: { id: device.userId }, select: { email: true, active: true },
    }) : null;
    const active = device && user?.active ? { ...device, email: user.email } : null;
    const candidate = active && await latestCandidate(active, ticket.draftRef);
    const ticketWhere = { id: ticket.id, state: "sending", nextTry };
    if (candidate === "pending") {
      await prisma.waDraftPushDelivery.updateMany({
        where: ticketWhere, data: { state: "pending", nextTry: new Date(Date.now() + pollingInterval), attempts: { decrement: 1 } },
      });
      continue;
    }
    if (!active || !candidate || !enabledFor(active, candidate)) {
      await prisma.waDraftPushDelivery.updateMany({ where: ticketWhere, data: { state: "cancelled" } });
      continue;
    }
    const sent = await sendToApns(config, active, candidate).catch(() => ({ status: 0, reason: undefined }));
    if (sent.status === 410 || sent.reason === "BadDeviceToken" || sent.reason === "DeviceTokenNotForTopic") {
      await prisma.waDraftPushDevice.deleteMany({
        where: { id: active.id, token: active.token, updatedAt: active.updatedAt },
      });
    } else if (sent.status === 200) {
      await prisma.waDraftPushDelivery.updateMany({ where: ticketWhere, data: { state: "sent" } });
    } else if (([0, 429].includes(sent.status) || sent.status >= 500) && ticket.attempts + 1 < maxAttempts) {
      await prisma.waDraftPushDelivery.updateMany({
        where: ticketWhere, data: { state: "pending", nextTry: new Date(Date.now() + 20_000 * (2 ** ticket.attempts)) },
      });
    } else {
      await prisma.waDraftPushDelivery.updateMany({ where: ticketWhere, data: { state: "failed" } });
      console.warn("[whatsapp-draft-push] APNs delivery failed", sent.status);
    }
  }
}

let lastCleanup = 0;

export async function runWhatsAppDraftPushWorker() {
  const config = apnsConfig();
  if (!config) return;
  const cutoff = new Date(Date.now() - day);
  if (Date.now() - lastCleanup > day) {
    await prisma.waDraftPushDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * day) } } });
    lastCleanup = Date.now();
  }
  const devices = await prisma.waDraftPushDevice.findMany({ where: { OR: [{ officeSince: { not: null } }, { personalSince: { not: null } }] } });
  if (devices.length) {
    const users = await prisma.user.findMany({ where: { id: { in: devices.map(({ userId }) => userId) }, active: true }, select: { id: true, email: true } });
    const emails = new Map(users.map(({ id, email }) => [id, email]));
    await materialize(devices.flatMap((device) => {
      const email = emails.get(device.userId);
      return email ? [{ ...device, email }] : [];
    }), cutoff);
  }
  await deliver(config, cutoff);
}

let running = false;

export function startWhatsAppDraftPushWorker() {
  if (running) return;
  running = true;
  if (!apnsConfig()) {
    console.warn("[whatsapp-draft-push] APNs configuration is missing");
    return;
  }
  async function tick() {
    try { await runWhatsAppDraftPushWorker(); }
    catch { console.error("[whatsapp-draft-push] Push worker failed"); }
    setTimeout(tick, pollingInterval).unref();
  }
  void tick();
}
