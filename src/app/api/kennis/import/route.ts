import { NextRequest, NextResponse } from "next/server";
import { knowledgeAccess } from "@/lib/knowledge/auth";
import { ingestKnowledge } from "@/lib/knowledge/ingest";
import type { KnowledgeImport } from "@/lib/knowledge/types";

export async function POST(request: NextRequest) {
  if (!await knowledgeAccess(request, true)) return NextResponse.json({ error: "Geen beheerrechten" }, { status: 403 });
  const body = await request.json() as { sources?: KnowledgeImport[]; withEmbeddings?: boolean };
  if (!Array.isArray(body.sources) || body.sources.length < 1 || body.sources.length > 100) return NextResponse.json({ error: "Geef 1 tot 100 bronnen op" }, { status: 400 });
  const results = [];
  for (const source of body.sources) results.push(await ingestKnowledge(source, body.withEmbeddings !== false));
  return NextResponse.json({ success: true, imported: results.length, results });
}
