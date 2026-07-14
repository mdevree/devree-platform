import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const STALE_AFTER_HOURS = 48;

function countByKey<T extends Record<string, unknown>>(
  rows: Array<T & { _count: { _all: number } }>,
  key: keyof T
) {
  return Object.fromEntries(rows.map((row) => [String(row[key]), row._count._all]));
}

function hoursSince(date: Date | null | undefined) {
  if (!date) return null;
  return Math.round((Date.now() - date.getTime()) / (60 * 60 * 1000));
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalMutations,
    mutations7d,
    marketObjects,
    realworksSources,
    opportunitiesTotal,
    opportunitiesOpen,
    mutationTypes,
    runStatuses,
    latestRun,
    latestRuns,
    latestMutation,
    latestMutations,
  ] = await Promise.all([
    prisma.realworksObjectMutation.count(),
    prisma.realworksObjectMutation.count({ where: { receivedAt: { gte: since } } }),
    prisma.marketObject.count(),
    prisma.marketObjectSource.count({ where: { source: "realworks" } }),
    prisma.actionOpportunity.count({ where: { sourceType: "realworks_object_match" } }),
    prisma.actionOpportunity.count({ where: { sourceType: "realworks_object_match", status: "open" } }),
    prisma.realworksObjectMutation.groupBy({
      by: ["mutationType"],
      _count: { _all: true },
      orderBy: { mutationType: "asc" },
    }),
    prisma.realworksMutationIngestRun.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.realworksMutationIngestRun.findFirst({
      orderBy: { processedAt: "desc" },
      select: {
        id: true,
        sourceMessageId: true,
        sourceSubject: true,
        sourceDate: true,
        processedAt: true,
        status: true,
        parsed: true,
        created: true,
        updated: true,
        opportunitiesCreated: true,
        opportunitiesUpdated: true,
        opportunitiesSkipped: true,
        error: true,
      },
    }),
    prisma.realworksMutationIngestRun.findMany({
      orderBy: { processedAt: "desc" },
      take: 8,
      select: {
        id: true,
        sourceSubject: true,
        sourceDate: true,
        processedAt: true,
        status: true,
        parsed: true,
        created: true,
        updated: true,
        opportunitiesCreated: true,
        opportunitiesUpdated: true,
        opportunitiesSkipped: true,
        error: true,
      },
    }),
    prisma.realworksObjectMutation.findFirst({
      orderBy: { receivedAt: "desc" },
      select: {
        receivedAt: true,
        sourceSubject: true,
        mutationType: true,
        addressRaw: true,
      },
    }),
    prisma.realworksObjectMutation.findMany({
      orderBy: { receivedAt: "desc" },
      take: 8,
      select: {
        id: true,
        receivedAt: true,
        sourceSubject: true,
        mutationType: true,
        mutationLabel: true,
        addressRaw: true,
        city: true,
        askingPrice: true,
      },
    }),
  ]);

  const latestActivityAt = latestRun?.processedAt ?? latestMutation?.receivedAt ?? null;
  const latestActivityAgeHours = hoursSince(latestActivityAt);
  const trackingActive = Boolean(latestRun);
  const stale = latestActivityAgeHours !== null && latestActivityAgeHours > STALE_AFTER_HOURS;
  const latestFailed = latestRun?.status === "failed";
  const health = latestFailed || stale ? "attention" : "ok";

  return NextResponse.json({
    health,
    checkedAt: new Date().toISOString(),
    trackingActive,
    staleAfterHours: STALE_AFTER_HOURS,
    latestActivityAgeHours,
    latestRun,
    latestMutation,
    totals: {
      mutations: totalMutations,
      mutations7d,
      marketObjects,
      realworksSources,
      opportunitiesTotal,
      opportunitiesOpen,
    },
    mutationTypes: countByKey(mutationTypes, "mutationType"),
    runStatuses: countByKey(runStatuses, "status"),
    latestRuns,
    latestMutations,
  });
}
