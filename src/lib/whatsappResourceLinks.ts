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
