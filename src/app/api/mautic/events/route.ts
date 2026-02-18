import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/mautic/events
 * Haal opgeslagen Mautic events op (email clicks, opens, etc.)
 *
 * Query params:
 * - contactId: filter op Mautic contact ID
 * - type: filter op eventType (email.click, email.open, etc.)
 * - since: ISO datum, filter events vanaf deze datum
 * - limit: aantal resultaten (default 20)
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const contactId = searchParams.get("contactId");
  const type = searchParams.get("type");
  const since = searchParams.get("since");
  const limit = parseInt(searchParams.get("limit") || "20");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (contactId) {
    where.mauticContactId = parseInt(contactId);
  }
  if (type) {
    where.eventType = type;
  }
  if (since) {
    where.occurredAt = { gte: new Date(since) };
  }

  const events = await prisma.mauticEvent.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ events });
}
