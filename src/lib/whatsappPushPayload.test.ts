import { createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { isPreviewKey, whatsappPushPayload } from "./whatsappPushPayload";

test("De APNs-voorvertoning laat de klantgegevens alleen versleuteld door", () => {
  const receiver = generateKeyPairSync("x25519");
  const key = Buffer.from(receiver.publicKey.export({ format: "jwk" }).x!, "base64url").toString("base64");
  assert.equal(isPreviewKey(key), true);
  const body = "Sanne Jansen · kan ze vrijdag om 12.00 uur bezichtigen?";
  const payload = whatsappPushPayload("reply-bezichtiging", body, key);
  assert.doesNotMatch(payload, /Sanne|Jansen|vrijdag/);
  const parsed = JSON.parse(payload);
  assert.equal(parsed.aps.category, "WHATSAPP_DRAFT");
  assert.equal(parsed.aps["mutable-content"], 1);
  assert.equal(parsed.draft, "reply-bezichtiging");

  const { publicKey, salt, sealed } = parsed.preview;
  const publicKeyObject = createPublicKey({
    format: "jwk", key: { kty: "OKP", crv: "X25519", x: Buffer.from(publicKey, "base64").toString("base64url") },
  });
  const shared = diffieHellman({ privateKey: receiver.privateKey, publicKey: publicKeyObject });
  const derivedKey = Buffer.from(hkdfSync("sha256", shared, Buffer.from(salt, "base64"), "devree-whatsapp-preview-v1", 32));
  const encrypted = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(-16));
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]);
  assert.deepEqual(JSON.parse(decrypted.toString()), { body });
});

test("Ongeldige sleutel geeft een algemene melding met een geldige deep link", () => {
  assert.equal(isPreviewKey(Buffer.alloc(32).toString("base64")), false);
  const parsed = JSON.parse(whatsappPushPayload("followup-123", "Naam", "ongeldig"));
  assert.equal(parsed.preview, undefined);
  assert.equal(parsed.aps.alert.body, "Er staat een concept voor je klaar.");
  assert.equal(parsed.draft, "followup-123");
});
