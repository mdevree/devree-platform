import assert from "node:assert/strict";
import test from "node:test";
import type { sendNotification } from "web-push";
import { sendWhatsAppWebPush } from "./whatsappWebPush";

const vapid = { subject: "https://kantoor.devreemakelaardij.nl", publicKey: "test-public", privateKey: "test-private" };
const subscription = { endpoint: "https://web.push.apple.com/Q-test-only", p256dh: "test-device-public", authKey: "test-auth" };

test("Web Push passes a compact draft notification to the encrypted sender with a short expiry", async (t) => {
  const send = t.mock.fn<typeof sendNotification>(async () => ({ statusCode: 201, headers: {}, body: "" }));
  const draft = "reply-one-test-draft";
  const recipient = "Testcontact";
  const summary = "Tweede bezichtiging\nvolgende week.";
  const result = await sendWhatsAppWebPush(vapid, subscription, { draft, body: `${recipient} · ${summary}` }, send);

  assert.deepEqual(result, { status: 201, invalid: false });
  const [target, payload, options] = send.mock.calls[0].arguments;
  assert.deepEqual(target, { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.authKey } });
  assert.ok(typeof payload === "string");
  assert.deepEqual(JSON.parse(payload), { draft, body: "Testcontact · Tweede bezichtiging volgende week." });
  assert.equal(options?.contentEncoding, "aes128gcm");
  assert.equal(options?.TTL, 300);
  assert.equal(options?.timeout, 8_000);
  assert.match(options?.topic ?? "", /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(options?.vapidDetails, vapid);
});

test("Web Push rejects an invalid endpoint without making a request", async (t) => {
  const send = t.mock.fn<typeof sendNotification>(async () => {
    throw new Error("Unexpected network request");
  });
  const result = await sendWhatsAppWebPush(vapid, { ...subscription, endpoint: "https://invalid.example/private" }, { draft: null, body: "Test" }, send);
  assert.deepEqual(result, { status: 410, invalid: true });
  assert.equal(send.mock.callCount(), 0);
});

test("Web Push reports only the HTTP status for invalid devices and retriable failures", async (t) => {
  let status = 404;
  const send = t.mock.fn<typeof sendNotification>(async () => {
    throw { statusCode: status, endpoint: subscription.endpoint, body: "Private provider response" };
  });
  for (const [code, invalid] of [[404, true], [410, true], [429, false], [500, false]] as const) {
    status = code;
    assert.deepEqual(await sendWhatsAppWebPush(vapid, subscription, { draft: null, body: "Test" }, send), { status: code, invalid });
  }
});
