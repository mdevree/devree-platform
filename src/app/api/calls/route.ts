import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/calls
 * Haal call history op met paginatie en filters
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const direction = searchParams.get("direction");
  const reason = searchParams.get("reason");
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");
  const search = searchParams.get("search");
  const projectId = searchParams.get("projectId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  where.status = "ended";

  if (direction) where.direction = direction;
  if (reason) where.reason = reason;
  if (projectId) where.projectId = projectId;

  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) where.timestamp.gte = new Date(dateFrom);
    if (dateTo) where.timestamp.lte = new Date(dateTo + "T23:59:59.999Z");
  }

  if (search) {
    where.OR = [
      { callerNumber: { contains: search } },
      { callerName: { contains: search } },
      { contactName: { contains: search } },
      { destinationNumber: { contains: search } },
    ];
  }

  const [calls, total] = await Promise.all([
    prisma.call.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, status: true } },
        _count: { select: { notes: true } },
      },
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.call.count({ where }),
  ]);

  return NextResponse.json({
    calls,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
