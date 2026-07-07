import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

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
  const [leads, agendaIssues, suspiciousEvents, openQuarantine] = await Promise.all([
    prisma.lead.findMany({
      select: { id: true, naam: true, email: true, telefoon: true, mauticContactId: true, updatedAt: true },
      take: 5000,
    }),
    prisma.agendaAfspraak.findMany({
      where: { enrichmentStatus: { in: ["no_contact", "no_project", "conflict", "needs_review", "error"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        systemid: true,
        agdescr: true,
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
