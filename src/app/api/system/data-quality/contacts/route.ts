import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { isExpectedMissingAgendaContact, isHandledQuarantineEvent } from "@/lib/systemDataQuality";

const AGENDA_ISSUE_LOOKBACK_DAYS = 14;

function groupDuplicates<T>(items: T[], keyFn: (item: T) => string | null) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item)?.trim().toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, count: rows.length, rows }));
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const agendaIssueSince = new Date(Date.now() - AGENDA_ISSUE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [leads, agendaCandidates, suspiciousCandidates, openQuarantine] = await Promise.all([
    prisma.lead.findMany({
      select: { id: true, naam: true, email: true, telefoon: true, mauticContactId: true, updatedAt: true },
      take: 5000,
    }),
    prisma.agendaAfspraak.findMany({
      where: {
        enrichmentStatus: { in: ["no_contact", "no_project", "conflict", "needs_review", "error"] },
        agbegin: { gte: agendaIssueSince },
        NOT: { aginactive: true },
      },
      orderBy: { agbegin: "desc" },
      take: 100,
      select: {
        id: true,
        systemid: true,
        agdescr: true,
        agtype: true,
        relationRelationid: true,
        agbegin: true,
        agrcode: true,
        agobjcode: true,
        contactNaam: true,
        contactEmail: true,
        enrichmentStatus: true,
      },
    }),
    prisma.realworksSyncEvent.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ["failed", "ignored", "quarantined"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        eventType: true,
        status: true,
        ignoredReason: true,
        payloadHash: true,
        email: true,
        rcode: true,
        systemid: true,
        createdAt: true,
      },
    }),
    prisma.realworksSyncQuarantine.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        reason: true,
        severity: true,
        eventType: true,
        email: true,
        rcode: true,
        systemid: true,
        createdAt: true,
      },
    }),
  ]);

  const candidateHashes = suspiciousCandidates
    .filter((event) => event.status === "quarantined" && event.payloadHash?.endsWith(":quarantine"))
    .map((event) => event.payloadHash!.slice(0, -":quarantine".length));
  const handledQuarantine = candidateHashes.length
    ? await prisma.realworksSyncQuarantine.findMany({
      where: { payloadHash: { in: candidateHashes }, status: { in: ["resolved", "ignored", "replayed"] } },
      select: { payloadHash: true },
    })
    : [];
  const handledHashes = new Set(handledQuarantine.flatMap((item) => item.payloadHash ? [item.payloadHash] : []));
  const suspiciousEvents = suspiciousCandidates.filter((event) => !isHandledQuarantineEvent(event, handledHashes));
  const agendaIssues = agendaCandidates.filter((item) => !isExpectedMissingAgendaContact(item));

  const duplicateEmails = groupDuplicates(leads, (lead) => lead.email);
  const duplicateMauticContactIds = groupDuplicates(leads, (lead) => lead.mauticContactId);
  const missingContactInfo = leads
    .filter((lead) => !lead.email && !lead.telefoon && !lead.mauticContactId)
    .slice(0, 100);

  return NextResponse.json({
    summary: {
      duplicateEmailGroups: duplicateEmails.length,
      duplicateMauticContactIdGroups: duplicateMauticContactIds.length,
      missingContactInfo: missingContactInfo.length,
      agendaIssues: agendaIssues.length,
      suspiciousSyncEvents: suspiciousEvents.length,
      openQuarantine: openQuarantine.length,
    },
    duplicateEmails,
    duplicateMauticContactIds,
    missingContactInfo,
    agendaIssues,
    suspiciousEvents,
    openQuarantine,
  });
}
