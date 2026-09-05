import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { knowledgeAccess } from "@/lib/knowledge/auth";
import { classifyQuery, searchKnowledge } from "@/lib/knowledge/search";
import { generateAnswer } from "@/lib/knowledge/gateway";
import { sanitizeForExternal } from "@/lib/knowledge/sanitize";

const SYSTEM = `Je bent de interne taxatie-kennisassistent van De Vree Makelaardij. Baseer je antwoord uitsluitend op de meegegeven bronnen. Officiele normen en actuele instructies gaan altijd voor praktijkvoorbeelden. Gevalideerde rapporten zijn alleen voorbeelden voor formulering en lokale context: kopieer nooit blind en presenteer ze nooit als regel. Geef geen marktwaarde, juridisch eindoordeel of verzonnen feit. Benoem onzekerheid en ontbrekende onderbouwing. Citeer in elke inhoudelijke alinea de bronnummers als [1].`;

export async function POST(request: NextRequest) {
  const user = await knowledgeAccess(request); if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const started = Date.now(); let query = "";
  try {
    const body = await request.json(); query = typeof body.query === "string" ? body.query.slice(0, 3000).trim() : "";
    if (query.length < 2) throw new Error("Stel eerst een vraag");
    const results = await searchKnowledge({ ...body, query, limit: 10 });
    if (!results.length) return NextResponse.json({ answer: "Ik vind hiervoor nog geen bruikbare bron in de kennisbank.", queryType: classifyQuery(query), sources: [] });
    const context = results.map((r, i) => `[${i + 1}] ${r.title} | ${r.sourceType} | ${r.section || ""}\n${sanitizeForExternal(r.excerpt)}`).join("\n\n");
    const answer = await generateAnswer(SYSTEM, `Vraag: ${sanitizeForExternal(query)}\n\nBronnen:\n${context}`);
    await prisma.knowledgeAuditEvent.create({ data: { userId: user.id, action: "CHAT", queryType: classifyQuery(query), queryHash: createHash("sha256").update(query).digest("hex"), sourceIds: results.map((r) => r.sourceId), model: process.env.RAG_CHAT_MODEL || "gpt-5-mini", durationMs: Date.now() - started } });
    return NextResponse.json({ answer, queryType: classifyQuery(query), sources: results });
  } catch (error) {
    await prisma.knowledgeAuditEvent.create({ data: { userId: user.id, action: "CHAT", queryHash: query ? createHash("sha256").update(query).digest("hex") : null, success: false, error: error instanceof Error ? error.message : "Chat mislukt", durationMs: Date.now() - started } }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chat mislukt" }, { status: 400 });
  }
}
