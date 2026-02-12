import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { searchContacts } from "@/lib/mautic";

/**
 * GET /api/mautic/contacts
 * Haal contacten op uit Mautic met zoek en paginatie
 *
 * Query params:
 *   search   - zoekterm (naam, e-mail, telefoon)
 *   page     - paginanummer (default 1)
 *   limit    - aantal per pagina (default 30)
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "30");
  const start = (page - 1) * limit;

  const { contacts, total } = await searchContacts({
    search,
    start,
    limit,
    orderBy: "last_active",
    orderByDir: "desc",
  });

  return NextResponse.json({
    contacts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
