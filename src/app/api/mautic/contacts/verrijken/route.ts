import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { getContactsBySegment } from "@/lib/mautic";

const DEFAULT_ENRICHMENT_SEGMENT_ID = 32;

/**
 * GET /api/mautic/contacts/verrijken
 * Haal de Mautic-werkvoorraad "Te verrijken contacten" op.
 *
 * Query params:
 * - search: vrije tekst zoekterm
 * - page: paginanummer, start bij 1
 * - limit: aantal resultaten
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
  const start = (page - 1) * limit;
  const segmentId = parseInt(
    process.env.MAUTIC_ENRICHMENT_SEGMENT_ID || String(DEFAULT_ENRICHMENT_SEGMENT_ID)
  );

  const { contacts, total } = await getContactsBySegment({
    segmentId,
    search,
    start,
    limit,
    orderBy: "dateAdded",
    orderByDir: "desc",
  });

  return NextResponse.json({
    contacts,
    segmentId,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
