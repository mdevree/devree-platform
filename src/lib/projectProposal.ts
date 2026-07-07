import crypto from "crypto";

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

export function proposalExpiresAt(days = 30) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
