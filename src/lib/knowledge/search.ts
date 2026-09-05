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

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function classifyQuery(query: string) {
  if (/\b(moet|regel|nwwi|nrvt|evs|instructie|vereist|norm)\b/i.test(query)) return "REGELVRAAG";
  if (/\b(tekst|formuleer|schrijf|vergelijk|eerder|buurt|omgeving|motivatie)\b/i.test(query)) return "PRAKTIJKVRAAG";
  return "GEMENGD";
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

  return chunks.map((chunk) => {
    const semantic = queryEmbedding.length && chunk.embedding ? Math.max(0, cosineSimilarity(queryEmbedding, decodeEmbedding(chunk.embedding))) : 0;
    const lexicalScore = lexical(query, `${chunk.section || ""} ${chunk.content}`);
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
    const relevance = (queryEmbedding.length ? semantic * 0.5 + lexicalScore * 0.18 : lexicalScore * 0.68)
      + geoScore * 0.14 + typeScore * 0.05 + yearScore * 0.03 + authority * 0.1 + practiceBoost + rulePenalty;
    return {
      id: chunk.id, sourceId: chunk.sourceId, title: chunk.source.title, sourceType: chunk.source.sourceType,
      publisher: chunk.source.publisher, section: chunk.section, fieldKey: chunk.fieldKey,
      excerpt: chunk.content.slice(0, 800), relevance, distanceKm: distance,
      authorityRank: chunk.source.authorityRank, sourceUrl: chunk.source.sourceUrl,
      reportAddress: chunk.source.reportAddress, validationStatus: chunk.source.validationStatus,
    };
  }).filter((item) => item.relevance > 0.08).sort((a, b) => b.relevance - a.relevance).slice(0, Math.min(options.limit || 8, 20));
}
