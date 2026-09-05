import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { knowledgeAccess } from "@/lib/knowledge/auth";

export async function GET(request: NextRequest) {
  if (!await knowledgeAccess(request)) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const [sources, chunkCount] = await Promise.all([
    prisma.knowledgeSource.findMany({
      include: { _count: { select: { chunks: true } } },
      orderBy: [{ authorityRank: "desc" }, { updatedAt: "desc" }], take: 250,
    }),
    prisma.knowledgeChunk.count(),
  ]);
  return NextResponse.json({ sources, stats: { sources: sources.length, chunks: chunkCount, embedded: await prisma.knowledgeChunk.count({ where: { embedding: { not: null } } }) } });
}
