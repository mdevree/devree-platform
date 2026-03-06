import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/hypotheekadviseurs/[id]/vve-gesprekken
 * Haal alle VVE gesprekken op voor een adviseur
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const gesprekken = await prisma.vveGesprek.findMany({
    where: { hypotheekAdviseurId: id },
    orderBy: { datum: "desc" },
  });

  return NextResponse.json({ gesprekken });
}

/**
 * POST /api/hypotheekadviseurs/[id]/vve-gesprekken
 * Maak een nieuw VVE gesprek aan
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  if (!data.naam || !data.datum) {
    return NextResponse.json(
      { error: "Naam en datum zijn verplicht" },
      { status: 400 }
    );
  }

  const gesprek = await prisma.vveGesprek.create({
    data: {
      naam: data.naam,
      datum: new Date(data.datum),
      omschrijving: data.omschrijving || null,
      hypotheekAdviseurId: id,
    },
  });

  return NextResponse.json({ success: true, gesprek }, { status: 201 });
}
