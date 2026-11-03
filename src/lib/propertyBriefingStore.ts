import { prisma } from "@/lib/prisma";
import { reusePropertyBriefing, type CachedBriefing } from "@/lib/propertyBriefingCache";
import { extractLijstVanZakenFields, normalizeLijstVanZaken, type ZakenList } from "@/lib/lijstVanZaken";
import { extractVragenlijstFields, normalizeVragenlijst, type QuestionList } from "@/lib/vragenlijst";
async function stored<T>(kind: string, objectcode: string, fields: Record<string, string>, build: () => T) {
  return reusePropertyBriefing(kind, fields, {
    async read(hash) {
      const row = await prisma.realworksBackupCapture.findUnique({ where: { id: `briefing-${hash}` }, select: { responseBody: true } });
      return row?.responseBody ? JSON.parse(row.responseBody) as CachedBriefing<T> : null;
    },
    async write(hash, value) {
      const row = await prisma.realworksBackupCapture.upsert({ where: { id: `briefing-${hash}` }, update: {}, create: {
        id: `briefing-${hash}`, source: `briefing:${kind}:${objectcode}`, host: "kantoor.devreemakelaardij.nl",
        path: "/internal/property-briefing", url: "/internal/property-briefing", transport: "stored_summary", responseBody: JSON.stringify(value),
      }, select: { responseBody: true } });
      return JSON.parse(row.responseBody!) as CachedBriefing<T>;
    },
  }, build);
}
export async function storedLijstVanZaken(input: unknown) {
  const fields = extractLijstVanZakenFields(input);
  const result = await stored<ZakenList>("zaken", fields.objectcode, fields, () => normalizeLijstVanZaken(fields));
  return { ...result.list, fields, sellerUpdatedAt: fields.klanten_intranet_datum_aanpassing || "", contentHash: result.contentHash, summaryGeneratedAt: result.summaryGeneratedAt };
}
export async function storedVragenlijst(input: unknown) {
  const fields = extractVragenlijstFields(input);
  const result = await stored<QuestionList>("vragen", fields.vllisnr, fields, () => normalizeVragenlijst(fields));
  return { ...result.list, fields, sellerUpdatedAt: fields.changedbycustomer || fields.vllastupd || "", contentHash: result.contentHash, summaryGeneratedAt: result.summaryGeneratedAt };
}
