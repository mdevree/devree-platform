import { createCipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";

const info = Buffer.from("devree-whatsapp-preview-v1");

export function isPreviewKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9+/]{43}=$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.some(Boolean) && decoded.toString("base64") === value;
}

export function encryptWhatsAppPreview(body: string, recipientKey: string) {
  const recipient = createPublicKey({
    format: "jwk", key: { kty: "OKP", crv: "X25519", x: Buffer.from(recipientKey, "base64").toString("base64url") },
  });
  const ephemeral = generateKeyPairSync("x25519");
  const salt = randomBytes(32);
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient });
  const key = Buffer.from(hkdfSync("sha256", shared, salt, info, 32));
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ body }), "utf8"), cipher.final()]);
  return {
    publicKey: Buffer.from(ephemeral.publicKey.export({ format: "jwk" }).x!, "base64url").toString("base64"),
    salt: salt.toString("base64"),
    sealed: Buffer.concat([nonce, encrypted, cipher.getAuthTag()]).toString("base64"),
  };
}

export function whatsappPushPayload(draft: string, body: string, recipientKey: string) {
  let preview;
  try { preview = encryptWhatsAppPreview(body, recipientKey); } catch { /* Generic APNs alert still opens the draft. */ }
  return JSON.stringify({
    aps: {
      alert: { title: "Nieuw WhatsApp-concept", body: "Er staat een concept voor je klaar." },
      category: "WHATSAPP_DRAFT", "mutable-content": 1, sound: "default",
    },
    draft,
    ...(preview && { preview }),
  });
}
