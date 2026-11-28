import { createHash } from "node:crypto";

export function officePage(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || !["www.devreemakelaardij.nl", "devreemakelaardij.nl"].includes(u.hostname) ||
        u.username || u.password || u.port || u.pathname === "/") return null;
    return `https://www.devreemakelaardij.nl${u.pathname.replace(/\/+$/, "")}/`;
  } catch { return null; }
}

export function linksIn(text: string) {
  return (text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []).map(url => url.replace(/[.,;:!?)\]]+$/, ""));
}

export function pageHash(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

export function sentPageHashes(text: string) {
  return [...new Set(linksIn(text).map(officePage).filter((url): url is string => !!url).map(pageHash))];
}

export function normal(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f.]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\b([a-z]) (?=[a-z]\b)/g, "$1").trim();
}

export function mentionsAddress(history: string, address: string) {
  const key = normal(address);
  return !!key && history.includes(` ${key} `);
}
