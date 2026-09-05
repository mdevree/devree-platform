import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { knowledgeAccess } from "@/lib/knowledge/auth";

export async function POST(request: NextRequest) {
  if (!await knowledgeAccess(request, true)) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  const body = await request.json() as { archiveId?: string; taxcode?: string; validationId?: string; occurredAt?: string; subject?: string };
  if (!body.archiveId) return NextResponse.json({ error: "archiveId ontbreekt" }, { status: 400 });
  const source = body.taxcode ? await prisma.knowledgeSource.findUnique({ where: { realworksTaxcode: body.taxcode } }) : null;
  const ready = /taxatierapport gereed/i.test(body.subject || "") || Boolean(body.validationId);
  const event = await prisma.knowledgeValidationEvent.upsert({
    where: { archiveId: body.archiveId },
    create: { archiveId: body.archiveId, sourceId: source?.id, eventType: ready ? "NWWI_READY" : "NWWI_EVENT", matchStatus: source ? "MATCHED" : "UNMATCHED", matchedBy: source ? "taxcode" : null, occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(), details: body },
    update: { sourceId: source?.id, matchStatus: source ? "MATCHED" : "UNMATCHED", details: body },
  });
  if (source && ready) await prisma.knowledgeSource.update({ where: { id: source.id }, data: { status: "ACTIVE", sourceType: "VALIDATED_REPORT", authorityRank: 35, validationStatus: "NWWI_VALIDATED", validatedAt: body.occurredAt ? new Date(body.occurredAt) : new Date() } });
  return NextResponse.json({ success: true, matched: Boolean(source), activated: Boolean(source && ready), eventId: event.id });
}
