import { prisma } from "@/lib/prisma";
import { cosineSimilarity, decodeEmbedding } from "./embedding";
import { embedTexts } from "./gateway";
import { sanitizeForExternal } from "./sanitize";
import type { KnowledgeSearchOptions } from "./types";

function words(value: string) {
  return [...new Set(value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2))];
}

function lexical(query: string, text: string) {
  const terms = words(query); if (!terms.length) return 0;
  const haystack = text.toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length / terms.length;
}

export function sourceLexicalCoverage(query: string, sourceText: string) {
  // Bij een expliciet adres is de bron zelf de zoekterm. Meet daarom ook hoeveel
  // onderscheidende woorden uit titel/adres in de vraag staan, in plaats van de
  // score te verdunnen met woorden als "zoek", "bron" en "passages".
  return lexical(sourceText, query);
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function classifyQuery(query: string) {
  if (/\b(moet|regel|nwwi|nrvt|evs|instructie|vereist|norm)\b/i.test(query)) return "REGELVRAAG";
  if (/\b(tekst|formuleer|schrijf|vergelijk|eerder|buurt|omgeving|motivatie|taxaties?|rapporten?|taxatierapporten?|gevalideerd(?:e)?)\b/i.test(query)) return "PRAKTIJKVRAAG";
  return "GEMENGD";
}

type RankedKnowledgeResult = {
  sourceId: string;
  sourceType: string;
  sourceMatch: number;
  relevance: number;
};

export function selectDiverseResults<T extends RankedKnowledgeResult>(items: T[], limit: number): T[] {
  const selected: T[] = [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const current = counts.get(item.sourceId) || 0;
    // Een exact passende gevalideerde taxatie mag meerdere relevante passages leveren.
    // Lange instructies en updates krijgen maximaal twee plaatsen, zodat één document
    // niet de volledige context voor de antwoordgenerator kan bezetten.
    const maximum = item.sourceType === "VALIDATED_REPORT" && item.sourceMatch >= 0.35 ? 4 : 2;
    if (current >= maximum) continue;
    selected.push(item);
    counts.set(item.sourceId, current + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function searchKnowledge(options: KnowledgeSearchOptions) {
  const query = options.query.trim();
  if (query.length < 2) throw new Error("Zoekvraag is te kort");
  const queryType = classifyQuery(query);
  let queryEmbedding: number[] = [];
  try { queryEmbedding = (await embedTexts([sanitizeForExternal(query)]))[0] || []; } catch {}

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { source: { status: "ACTIVE", sourceType: options.sourceTypes?.length ? { in: options.sourceTypes } : undefined } },
    include: { source: true }, take: 5000, orderBy: { updatedAt: "desc" },
  });

  const ranked = chunks.map((chunk) => {
    const semantic = queryEmbedding.length && chunk.embedding ? Math.max(0, cosineSimilarity(queryEmbedding, decodeEmbedding(chunk.embedding))) : 0;
    const lexicalScore = lexical(query, `${chunk.section || ""} ${chunk.content}`);
    const sourceText = [
      chunk.source.title, chunk.source.reportAddress, chunk.source.reportPostcode,
      chunk.source.reportCity, chunk.source.realworksTaxcode,
    ].filter(Boolean).join(" ");
    const sourceMatch = lexical(query, sourceText);
    const identityText = [chunk.source.title, chunk.source.reportAddress].filter(Boolean).join(" ");
    const sourceCoverage = sourceLexicalCoverage(query, identityText);
    let geoScore = 0, distance: number | null = null;
    if (options.latitude != null && options.longitude != null && chunk.source.latitude != null && chunk.source.longitude != null) {
      distance = distanceKm(options.latitude, options.longitude, chunk.source.latitude, chunk.source.longitude);
      geoScore = distance <= 0.25 ? 1 : distance <= 2 ? Math.max(0, 1 - (distance - 0.25) / 1.75) : 0;
    }
    const typeScore = options.propertyType && chunk.source.reportPropertyType?.toLowerCase().includes(options.propertyType.toLowerCase()) ? 1 : 0;
    const yearScore = options.buildYear && chunk.source.reportBuildYear ? Math.max(0, 1 - Math.abs(options.buildYear - chunk.source.reportBuildYear) / 50) : 0;
    const authority = chunk.source.authorityRank / 100;
    const practiceBoost = queryType === "PRAKTIJKVRAAG" && chunk.source.sourceType === "VALIDATED_REPORT" ? 0.08 : 0;
    const rulePenalty = queryType === "REGELVRAAG" && chunk.source.sourceType === "VALIDATED_REPORT" ? -0.15 : 0;
    const exactReportBoost = chunk.source.sourceType === "VALIDATED_REPORT" && sourceCoverage >= 0.7 ? 0.75 : 0;
    const relevance = (queryEmbedding.length ? semantic * 0.38 + lexicalScore * 0.16 : lexicalScore * 0.54)
      + sourceMatch * 0.28
      + geoScore * 0.14 + typeScore * 0.05 + yearScore * 0.03 + authority * 0.1 + practiceBoost + rulePenalty + exactReportBoost;
    return {
      id: chunk.id, sourceId: chunk.sourceId, title: chunk.source.title, sourceType: chunk.source.sourceType,
      publisher: chunk.source.publisher, section: chunk.section, fieldKey: chunk.fieldKey,
      excerpt: chunk.content.slice(0, 800), relevance, distanceKm: distance,
      authorityRank: chunk.source.authorityRank, sourceUrl: chunk.source.sourceUrl,
      reportAddress: chunk.source.reportAddress, reportPostcode: chunk.source.reportPostcode,
      reportCity: chunk.source.reportCity, realworksTaxcode: chunk.source.realworksTaxcode,
      validationStatus: chunk.source.validationStatus, sourceMatch, sourceCoverage,
    };
  }).filter((item) => item.relevance > 0.08).sort((a, b) => b.relevance - a.relevance);

  const limit = Math.min(options.limit || 8, 20);
  return selectDiverseResults(ranked, limit);
}
