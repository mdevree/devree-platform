import { createECDH, ECDH } from "node:crypto";
import { isIP } from "node:net";

function asURL(value: string) {
  try { return new URL(value); } catch { return null; }
}

export function getWebPushEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 ||
      !/^https:\/\/[a-z\d.-]+(?::443)?\//i.test(value) || /[\s\\#]/u.test(value)) return null;
  const endpoint = asURL(value);
  if (!endpoint || endpoint.protocol !== "https:" || endpoint.port ||
      endpoint.username || endpoint.password || endpoint.pathname === "/") return null;

  const { hostname, pathname } = endpoint;
  const apple = /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+push\.apple\.com$/.test(hostname);
  const google = hostname === "fcm.googleapis.com" && /^\/(?:fcm\/send|wp)\/.+/.test(pathname);
  const mozilla = hostname === "updates.push.services.mozilla.com" && /^\/wpush\/v[12]\/.+/.test(pathname);
  return apple || google || mozilla ? endpoint.href : null;
}

function readKey(value: unknown, bytes: number): Buffer | null {
  if (typeof value !== "string" || value.length !== Math.ceil(bytes * 4 / 3) ||
      !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const key = Buffer.from(value, "base64url");
  return key.length === bytes && key.toString("base64url") === value ? key : null;
}

function readPublicKey(value: unknown): Buffer | null {
  const key = readKey(value, 65);
  if (key?.[0] !== 4) return null;
  try {
    ECDH.convertKey(key, "prime256v1");
    return key;
  } catch {
    return null;
  }
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function getWebPushSubscription(value: unknown) {
  const data = record(value);
  const endpoint = getWebPushEndpoint(data?.endpoint);
  const keys = record(data?.keys);
  const p256dh = readPublicKey(keys?.p256dh);
  const authKey = readKey(keys?.auth, 16);
  if (!endpoint || !p256dh || !authKey) return null;
  return { endpoint, p256dh: p256dh.toString("base64url"), authKey: authKey.toString("base64url") };
}

export function webPushConfig() {
  const publicKey = process.env.WHATSAPP_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WHATSAPP_WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const publicPoint = readPublicKey(publicKey);
  const privateScalar = readKey(privateKey, 32);
  if (!publicKey || !privateKey || !publicPoint || !privateScalar) return null;

  const configuredSubject = process.env.WHATSAPP_WEB_PUSH_VAPID_SUBJECT?.trim();
  const site = configuredSubject || process.env.PLATFORM_BASE_URL ||
    process.env.NEXTAUTH_URL || "https://kantoor.devreemakelaardij.nl";
  const url = asURL(site);
  if (!url || url.protocol !== "https:" || url.username || url.password ||
      !url.hostname.includes(".") || isIP(url.hostname) ||
      /\.(?:localhost|local|test|invalid|example|internal)$/.test(url.hostname) ||
      (configuredSubject && (url.pathname !== "/" || url.search || url.hash))) return null;

  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(privateScalar);
    if (!ecdh.getPublicKey().equals(publicPoint)) return null;
  } catch {
    return null;
  }

  return { subject: url.origin, publicKey, privateKey };
}
