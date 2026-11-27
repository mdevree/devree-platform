import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { test } from "node:test";
import { getWebPushEndpoint, getWebPushSubscription, webPushConfig } from "./whatsappWebPushConfig";

test("allows Safari, Chrome and Firefox endpoints only on their push services", () => {
  for (const endpoint of [
    "https://web.push.apple.com/apple-token",
    "https://region.web.push.apple.com/region-token",
    "https://fcm.googleapis.com/fcm/send/google-token",
    "https://fcm.googleapis.com/wp/google-token",
    "https://updates.push.services.mozilla.com/wpush/v2/firefox-token",
  ]) {
    assert.equal(getWebPushEndpoint(endpoint), endpoint);
  }
  assert.equal(
    getWebPushEndpoint("https://WEB.PUSH.APPLE.COM:443/apple-token"),
    "https://web.push.apple.com/apple-token",
  );
});

test("rejects requests outside the browser Web Push endpoint allowlist", () => {
  for (const endpoint of [
    null,
    "http://web.push.apple.com/token",
    "https://web.push.apple.com/",
    "https://push.apple.com/token",
    "https://web.push.apple.com.attacker.test/token",
    "https://attackerpush.apple.com/token",
    "https://127.0.0.1/token",
    "https://[::1]/token",
    "https://user:pass@web.push.apple.com/token",
    "https://web.push.apple.com@attacker.test/token",
    "https://web.push.apple.com:8080/token",
    "https://web.push.apple.com/token#fragment",
    "https://web.push.apple.com\\@attacker.test/token",
    "https://web.push.apple.com/with tab\t",
    "https://fcm.googleapis.com/admin",
    "https://fcm.googleapis.com/fcm/send/../admin",
    "https://updates.push.services.mozilla.com/api/token",
  ]) {
    assert.equal(getWebPushEndpoint(endpoint), null, String(endpoint));
  }
});

test("validates subscription key lengths and the P-256 point before saving", () => {
  const endpoint = "https://web.push.apple.com/token";
  const p256dh = createECDH("prime256v1").generateKeys().toString("base64url");
  const auth = randomBytes(16).toString("base64url");
  assert.deepEqual(getWebPushSubscription({ endpoint, keys: { p256dh, auth } }), {
    endpoint, p256dh, authKey: auth,
  });
  const malformedPoint = Buffer.concat([Buffer.of(4), Buffer.alloc(64)]).toString("base64url");
  for (const keys of [
    undefined,
    { p256dh, auth: auth + "=" },
    { p256dh, auth: randomBytes(15).toString("base64url") },
    { p256dh: malformedPoint, auth },
    { p256dh: p256dh.slice(0, 43), auth },
  ]) {
    assert.equal(getWebPushSubscription({ endpoint, keys }), null);
  }
});

test("enables Web Push only for a matching VAPID pair and public HTTPS subject", (t) => {
  const pub = "WHATSAPP_WEB_PUSH_VAPID_PUBLIC_KEY";
  const priv = "WHATSAPP_WEB_PUSH_VAPID_PRIVATE_KEY";
  const subj = "WHATSAPP_WEB_PUSH_VAPID_SUBJECT";
  const keys = [pub, priv, subj, "PLATFORM_BASE_URL", "NEXTAUTH_URL"];
  const saved = keys.map((key) => [key, process.env[key]] as const);
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of keys) delete process.env[key];

  assert.equal(webPushConfig(), null);
  const pair = createECDH("prime256v1");
  const publicKey = pair.generateKeys().toString("base64url");
  const scalar = pair.getPrivateKey();
  const privateKey = Buffer.concat([Buffer.alloc(32 - scalar.length), scalar]).toString("base64url");
  process.env[pub] = publicKey;
  process.env[priv] = privateKey;
  assert.deepEqual(webPushConfig(), {
    publicKey, privateKey, subject: "https://kantoor.devreemakelaardij.nl",
  });

  process.env.PLATFORM_BASE_URL = "https://example.com/mobile/deep";
  assert.equal(webPushConfig()?.subject, "https://example.com");
  process.env[subj] = "https://another.example.com";
  assert.equal(webPushConfig()?.subject, "https://another.example.com");
  for (const subject of [
    "http://example.com", "https://127.0.0.1", "https://localhost", "https://foo.local", "https://example.com/path",
  ]) {
    process.env[subj] = subject;
    assert.equal(webPushConfig(), null);
  }
  process.env[subj] = "https://example.com";
  const other = createECDH("prime256v1");
  process.env[pub] = other.generateKeys().toString("base64url");
  assert.equal(webPushConfig(), null);
});
