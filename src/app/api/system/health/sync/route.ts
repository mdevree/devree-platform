import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

async function statusCounts<T extends { status: string; _count: { _all: number } }>(rows: T[]) {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    eventCounts,
    quarantineCounts,
    latestEvents,
    latestQuarantine,
    realworksTasks,
    taxatieTasks,
    woningTasks,
    latestBackupCapture,
  ] = await Promise.all([
    prisma.realworksSyncEvent.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.realworksSyncQuarantine.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.realworksSyncEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventType: true,
        status: true,
        ignoredReason: true,
        email: true,
        rcode: true,
        systemid: true,
        extensionVersion: true,
        createdAt: true,
      },
    }),
    prisma.realworksSyncQuarantine.findMany({
      where: { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        reason: true,
        severity: true,
        eventType: true,
        email: true,
        rcode: true,
        systemid: true,
        extensionVersion: true,
        createdAt: true,
      },
    }),
    prisma.realworksTask.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.realworksTaxatieTask.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.realworksWoningTask.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.realworksBackupCapture.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { source: true, url: true, receivedAt: true },
    }),
  ]);

  const openQuarantine = quarantineCounts.find((row) => row.status === "open")?._count._all ?? 0;
  const failedEvents = eventCounts.find((row) => row.status === "failed")?._count._all ?? 0;
  const health = openQuarantine > 0 || failedEvents > 0 ? "attention" : "ok";

  return NextResponse.json({
    health,
    since: since.toISOString(),
    eventCounts24h: await statusCounts(eventCounts),
    quarantineCounts: await statusCounts(quarantineCounts),
    queues: {
      relation: await statusCounts(realworksTasks),
      taxatie: await statusCounts(taxatieTasks),
      woning: await statusCounts(woningTasks),
    },
    latestEvents,
    latestQuarantine,
    latestBackupCapture,
  });
}
