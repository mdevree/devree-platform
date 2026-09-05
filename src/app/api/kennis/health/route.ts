import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { knowledgeAccess } from "@/lib/knowledge/auth";

export async function GET(request: NextRequest) {
  if (!await knowledgeAccess(request)) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const [sources, chunks, embedded, validatedReports] = await Promise.all([
    prisma.knowledgeSource.count({ where: { status: "ACTIVE" } }), prisma.knowledgeChunk.count(),
    prisma.knowledgeChunk.count({ where: { embedding: { not: null } } }),
    prisma.knowledgeSource.count({ where: { sourceType: "VALIDATED_REPORT", status: "ACTIVE" } }),
  ]);
  return NextResponse.json({ ok: true, gatewayConfigured: Boolean(process.env.RAG_GATEWAY_URL && (process.env.RAG_GATEWAY_SECRET || process.env.N8N_WEBHOOK_SECRET)), sources, chunks, embedded, validatedReports });
}
