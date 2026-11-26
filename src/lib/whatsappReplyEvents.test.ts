import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getWahaReplyEvent,
  manualReplyCutoff,
  validPersonalWahaSignature,
} from "./whatsappReplyEvents";

const now = Date.UTC(2026, 10, 27, 11, 25, 0);
const phone = "31612345678@c.us";
const lid = "12345678901@lid";

function event(fields: Record<string, unknown> = {}) {
  return {
    session: "default",
    event: "message.any",
    payload: {
      from: phone,
      id: `false_${phone}_MESSAGE123`,
      timestamp: now / 1000 - 1,
      fromMe: false,
      source: "app",
      body: "Kan ik binnenkort komen kijken?",
      ...fields,
    },
  };
}

test("normalizes a direct WAHA message without importing quoted content", () => {
  const parsed = getWahaReplyEvent(
    event({
      from: lid,
      id: `false_${lid}_MESSAGE123`,
      _data: { key: { remoteJid: lid, remoteJidAlt: "31612345678@s.whatsapp.net" } },
      replyTo: { id: `true_${phone}_QUOTE45`, body: "niet opslaan" },
    }),
    now,
  );
  assert.deepEqual(parsed, {
    session: "default",
    chatId: phone,
    lid,
    occurredAt: new Date(now - 1000),
    providerMessageId: "MESSAGE123",
    quotedMessageId: "QUOTE45",
    type: "inbound",
    body: "Kan ik binnenkort komen kijken?",
  });
  assert.equal(getWahaReplyEvent(event({ from: lid }), now)?.chatId, undefined);
});

test("recognizes manual app replies separately from API sends or unclear sources", () => {
  const outgoing = { from: "31698765432@c.us", to: phone, fromMe: true };
  const manual = getWahaReplyEvent(event(outgoing), now);
  assert.equal(manual?.type, "manual");
  assert.equal(manual?.body, undefined);
  assert.equal(manual?.chatId, phone);
  assert.equal(getWahaReplyEvent(event({ ...outgoing, source: "api" }), now)?.type, "api");
  assert.equal(getWahaReplyEvent(event({ ...outgoing, source: undefined }), now), null);
  assert.equal(getWahaReplyEvent(event({ ...outgoing, hasMedia: true, body: "" }), now)?.type, "manual");
});

test("rejects group, non-text, protocol, contradictory and historical messages", () => {
  for (const input of [
    event({ from: "123456@g.us" }),
    event({ from: "status@broadcast" }),
    event({ from: "987654@newsletter" }),
    event({ hasMedia: true }),
    event({ _data: { message: { reactionMessage: {} } } }),
    event({ _data: { message: { protocolMessage: {} } } }),
    event({ chatId: "31698765432@c.us" }),
    event({ timestamp: now / 1000 - 86401 }),
    event({ ack: -1 }),
    { ...event(), event: "message.ack" },
  ]) {
    assert.equal(getWahaReplyEvent(input, now), null);
  }
});

test("a manual reply covers older inbound and covers same-second messages only with an exact quote", () => {
  const at = new Date(now);
  assert.equal(manualReplyCutoff(at).getTime(), now - 1);
  assert.equal(manualReplyCutoff(at, new Date(now - 1000)).getTime(), now - 1);
  assert.equal(manualReplyCutoff(at, at).getTime(), now);
});

test("checks WAHA HMAC against raw body and the dedicated secret", () => {
  const secret = "an-isolated-test-secret";
  const body = JSON.stringify(event());
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  assert.equal(validPersonalWahaSignature(body, signature, secret), true);
  assert.equal(validPersonalWahaSignature(body + " ", signature, secret), false);
  assert.equal(validPersonalWahaSignature(body, signature, "the-office-secret"), false);
  assert.equal(validPersonalWahaSignature(body, "invalid", secret), false);
});
