import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads/stats
 * Geeft tellingen terug per status, source, prioriteit en routeType.
 * Query params: dateFrom, dateTo (ISO strings, filter op createdAt van lead)
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const p = request.nextUrl.searchParams;
  const dateFrom = p.get("dateFrom");
  const dateTo = p.get("dateTo");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dateFilter: any = {};
  if (dateFrom || dateTo) {
    dateFilter.createdAt = {};
    if (dateFrom) dateFilter.createdAt.gte = new Date(dateFrom);
    if (dateTo) dateFilter.createdAt.lte = new Date(dateTo);
  }

  const [byStatus, bySource, byPrioriteit, byRouteType, totaal] = await Promise.all([
    prisma.lead.groupBy({
      by: ["status"],
      where: dateFilter,
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["source"],
      where: dateFilter,
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["prioriteit"],
      where: dateFilter,
      _count: { _all: true },
    }),
    prisma.leadRoute.groupBy({
      by: ["routeType"],
      _count: { _all: true },
    }),
    prisma.lead.count({ where: dateFilter }),
  ]);

  return NextResponse.json({
    totaal,
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    bySource: bySource.map((r) => ({ source: r.source, count: r._count._all })),
    byPrioriteit: byPrioriteit.map((r) => ({ prioriteit: r.prioriteit, count: r._count._all })),
    byRouteType: byRouteType.map((r) => ({ routeType: r.routeType, count: r._count._all })),
  });
}
