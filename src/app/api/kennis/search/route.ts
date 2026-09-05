import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { knowledgeAccess } from "@/lib/knowledge/auth";
import { classifyQuery, searchKnowledge } from "@/lib/knowledge/search";

export async function POST(request: NextRequest) {
  const user = await knowledgeAccess(request); if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const started = Date.now();
  try {
    const body = await request.json();
    const query = typeof body.query === "string" ? body.query.slice(0, 2000) : "";
    const results = await searchKnowledge({ ...body, query });
    await prisma.knowledgeAuditEvent.create({ data: { userId: user.id, action: "SEARCH", queryType: classifyQuery(query), queryHash: createHash("sha256").update(query).digest("hex"), sourceIds: results.map((r) => r.sourceId), durationMs: Date.now() - started } });
    return NextResponse.json({ queryType: classifyQuery(query), results });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Zoeken mislukt" }, { status: 400 }); }
}
