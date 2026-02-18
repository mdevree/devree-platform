import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/mautic/events/summary
 * Dashboard widget: tel email clicks van vandaag
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [clicksToday, recentClicks] = await Promise.all([
    prisma.mauticEvent.count({
      where: {
        eventType: "email.click",
        occurredAt: { gte: today },
      },
    }),
    prisma.mauticEvent.findMany({
      where: {
        eventType: "email.click",
        occurredAt: { gte: today },
      },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        id: true,
        mauticContactId: true,
        emailName: true,
        clickedUrl: true,
        occurredAt: true,
      },
    }),
  ]);

  const uniqueContactsToday = new Set(recentClicks.map((e) => e.mauticContactId)).size;

  return NextResponse.json({ clicksToday, uniqueContactsToday, recentClicks });
}
