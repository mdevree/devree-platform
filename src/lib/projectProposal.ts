import crypto from "crypto";

const PREVIEW_MAX_AGE_MS = 1000 * 60 * 60 * 8;

export function createProposalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function proposalTokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function publicProposalUrl(token: string) {
  const baseUrl = (
    process.env.PROPOSAL_PUBLIC_BASE_URL
    || process.env.NEXT_PUBLIC_PLATFORM_URL
    || process.env.PLATFORM_BASE_URL
    || process.env.NEXTAUTH_URL
    || "https://www.devreemakelaardij.nl"
  ).replace(/\/$/, "");

  return `${baseUrl}/voorstel/${encodeURIComponent(token)}`;
}

function previewSecret() {
  return process.env.NEXTAUTH_SECRET || process.env.N8N_WEBHOOK_SECRET || "devree-platform-preview";
}

export function proposalPreviewSignature(token: string, previewUntil: number) {
  return crypto
    .createHmac("sha256", previewSecret())
    .update(`${token}:${previewUntil}`)
    .digest("base64url");
}

export function publicProposalPreviewUrl(token: string, now = Date.now()) {
  const previewUntil = now + PREVIEW_MAX_AGE_MS;
  const signature = proposalPreviewSignature(token, previewUntil);
  const url = new URL(publicProposalUrl(token));
  url.searchParams.set("preview", "1");
  url.searchParams.set("previewUntil", String(previewUntil));
  url.searchParams.set("previewSig", signature);
  return url.toString();
}

export function isValidProposalPreview(token: string, previewUntil: string | undefined, previewSig: string | undefined, now = Date.now()) {
  const until = Number(previewUntil);
  if (!Number.isFinite(until) || until < now) return false;
  if (until - now > PREVIEW_MAX_AGE_MS + 1000 * 60) return false;
  if (!previewSig) return false;

  const expected = proposalPreviewSignature(token, until);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(previewSig);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function tokenFromProposalUrl(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const token = url.pathname.split("/").filter(Boolean).at(-1);
    return token ? decodeURIComponent(token) : null;
  } catch {
    return null;
  }
}

export function proposalExpiresAt(days = 30) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
