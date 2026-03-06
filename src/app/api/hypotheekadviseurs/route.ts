import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/hypotheekadviseurs
 * Haal hypotheekadviseurs op
 * Query params:
 * - actief: true | false (filter op actief/inactief)
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const actiefParam = searchParams.get("actief");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (actiefParam !== null) {
    where.actief = actiefParam === "true";
  }

  const adviseurs = await prisma.hypotheekAdviseur.findMany({
    where,
    include: {
      _count: { select: { leads: true, projecten: true, vveGesprekken: true } },
    },
    orderBy: { naam: "asc" },
  });

  return NextResponse.json({ adviseurs });
}

/**
 * POST /api/hypotheekadviseurs
 * Maak een nieuwe hypotheekadviseur aan
 */
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.naam) {
    return NextResponse.json(
      { error: "Naam is verplicht" },
      { status: 400 }
    );
  }

  const adviseur = await prisma.hypotheekAdviseur.create({
    data: {
      naam: data.naam,
      bedrijf: data.bedrijf || null,
      email: data.email || null,
      telefoon: data.telefoon || null,
      notities: data.notities || null,
    },
    include: {
      _count: { select: { leads: true, projecten: true, vveGesprekken: true } },
    },
  });

  return NextResponse.json({ success: true, adviseur }, { status: 201 });
}
