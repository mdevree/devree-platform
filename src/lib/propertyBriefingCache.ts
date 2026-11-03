import { createHash } from "node:crypto";
const transient = new Set(["klanten_intranet_datum_aanpassing", "changedbycustomer", "vllastupd"]);
export function propertyBriefingFingerprint(kind: string, fields: Record<string, string>) {
  const content = Object.fromEntries(Object.entries(fields).filter(([key]) => !transient.has(key)).sort(([a], [b]) => a.localeCompare(b, "en")));
  // Increment only when the summary rules themselves deliberately change.
  return createHash("sha256").update(JSON.stringify(["briefing-rules-1", kind, content])).digest("hex");
}
export type CachedBriefing<T> = { list: T; contentHash: string; summaryGeneratedAt: string };
export async function reusePropertyBriefing<T>(kind: string, fields: Record<string, string>, storage: {
  read: (key: string) => Promise<CachedBriefing<T> | null>;
  write: (key: string, value: CachedBriefing<T>) => Promise<CachedBriefing<T>>;
}, build: () => T): Promise<CachedBriefing<T>> {
  const contentHash = propertyBriefingFingerprint(kind, fields);
  const cached = await storage.read(contentHash);
  if (cached) return cached;
  return storage.write(contentHash, { list: build(), contentHash, summaryGeneratedAt: new Date().toISOString() });
}
