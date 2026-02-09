import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/calls
 * Haal call history op met paginatie en filters
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const direction = searchParams.get("direction"); // inbound, outbound
  const status = searchParams.get("status"); // ended
  const reason = searchParams.get("reason"); // completed, no-answer, busy
  const dateFrom = searchParams.get("from"); // YYYY-MM-DD
  const dateTo = searchParams.get("to"); // YYYY-MM-DD
  const search = searchParams.get("search"); // zoek op nummer of naam

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  // Alleen ended calls tonen (geen ringing/in-progress)
  where.status = "ended";

  if (direction) {
    where.direction = direction;
  }

  if (reason) {
    where.reason = reason;
  }

  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) {
      where.timestamp.gte = new Date(dateFrom);
    }
    if (dateTo) {
      where.timestamp.lte = new Date(dateTo + "T23:59:59.999Z");
    }
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
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.call.count({ where }),
  ]);

  return NextResponse.json({
    calls,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
