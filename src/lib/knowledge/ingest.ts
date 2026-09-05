import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedTexts } from "./gateway";
import { encodeEmbedding } from "./embedding";
import { normalizeText, sanitizeForExternal } from "./sanitize";
import { geocodeAddress } from "./geocode";
import type { KnowledgeImport } from "./types";

function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }
function json(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value ? JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue : undefined;
}

function chunksFor(input: KnowledgeImport) {
  const result: { section: string; fieldKey: string; content: string }[] = [];
  for (const field of input.fields || []) {
    const text = normalizeText(field.content);
    if (!text) continue;
    if (input.sourceType === "VALIDATED_REPORT" || text.length <= 1400) {
      result.push({ section: field.label, fieldKey: field.key, content: text });
      continue;
    }
    const paragraphs = text.split(/\n\s*\n/);
    let current = "";
    for (const paragraph of paragraphs) {
      if (current && current.length + paragraph.length > 1200) {
        result.push({ section: field.label, fieldKey: field.key, content: current.trim() }); current = "";
      }
      current += `${current ? "\n\n" : ""}${paragraph}`;
    }
    if (current.trim()) result.push({ section: field.label, fieldKey: field.key, content: current.trim() });
  }
  return result;
}

export async function ingestKnowledge(input: KnowledgeImport, withEmbeddings = true) {
  const chunks = chunksFor(input);
  if (!input.slug || !input.title || !input.sourceType || !chunks.length) throw new Error("Bron mist slug, titel, type of inhoud");
  const sanitized = chunks.map((chunk) => sanitizeForExternal(chunk.content));
  let embeddings: number[][] = [];
  if (withEmbeddings) {
    try { embeddings = await embedTexts(sanitized); } catch (error) { console.warn("Embedding overgeslagen:", error); }
  }
  const checksum = sha(chunks.map((chunk) => `${chunk.fieldKey}:${chunk.content}`).join("\n"));
  let latitude = input.latitude, longitude = input.longitude;
  if (latitude == null && longitude == null && input.reportAddress) {
    try {
      const point = await geocodeAddress([input.reportAddress, input.reportPostcode, input.reportCity].filter(Boolean).join(", "));
      latitude = point?.latitude ?? null; longitude = point?.longitude ?? null;
    } catch {}
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.knowledgeSource.findFirst({ where: { OR: [
      { slug: input.slug },
      ...(input.notionPageId ? [{ notionPageId: input.notionPageId }] : []),
      ...(input.realworksTaxcode ? [{ realworksTaxcode: input.realworksTaxcode }] : []),
    ] } });
    const values = {
        slug: input.slug, title: input.title, sourceType: input.sourceType,
        authorityRank: input.authorityRank ?? 50, publisher: input.publisher, sourceUrl: input.sourceUrl,
        notionPageId: input.notionPageId, reportTaxateur: input.reportTaxateur, reportAddress: input.reportAddress,
        reportPostcode: input.reportPostcode, reportCity: input.reportCity, reportPropertyType: input.reportPropertyType,
        reportBuildYear: input.reportBuildYear, latitude, longitude,
        validationStatus: input.validationStatus, validatedAt: input.validatedAt ? new Date(input.validatedAt) : null,
        realworksTaxcode: input.realworksTaxcode, realworksDossierNumber: input.realworksDossierNumber,
        projectId: input.projectId, status: input.status || "ACTIVE", checksum, metadata: json(input.metadata),
    };
    const source = existing
      ? await tx.knowledgeSource.update({ where: { id: existing.id }, data: { ...values, slug: existing.slug, notionPageId: input.notionPageId ?? existing.notionPageId } })
      : await tx.knowledgeSource.create({ data: values });
    await tx.knowledgeChunk.deleteMany({ where: { sourceId: source.id } });
    await tx.knowledgeChunk.createMany({ data: chunks.map((chunk, position) => ({
      sourceId: source.id, ...chunk, sanitizedContent: sanitized[position], position,
      embedding: embeddings[position]?.length ? encodeEmbedding(embeddings[position]) : null,
      embeddingModel: embeddings[position]?.length ? "text-embedding-3-small" : null,
      embeddingDimensions: embeddings[position]?.length || null, contentHash: sha(chunk.content),
    })) });
    return { ...source, chunkCount: chunks.length, embeddedCount: embeddings.filter(Boolean).length };
  });
}
