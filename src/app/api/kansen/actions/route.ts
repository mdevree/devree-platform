import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") || "open";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "100", 10);
  const opportunities = await prisma.actionOpportunity.findMany({
    where: status === "all" ? {} : { status },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: Number.isFinite(limit) ? limit : 100,
  });

  const counts = await prisma.actionOpportunity.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  return NextResponse.json({
    opportunities,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count.status])),
  });
}
