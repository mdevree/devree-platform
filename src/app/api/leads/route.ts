import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads
 * Haal leads op met filters
 * Query params:
 * - status: KIJKER | ZOEKER | CONVERTED | INACTIEF
 * - search: zoekterm (naam, email, telefoon)
 * - page, limit: paginatie
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "24");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { naam: { contains: search } },
      { email: { contains: search } },
      { telefoon: { contains: search } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        hypotheekAdviseur: { select: { id: true, naam: true, bedrijf: true } },
        _count: { select: { projecten: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    leads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/leads
 * Maak een nieuwe lead aan
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

  const lead = await prisma.lead.create({
    data: {
      naam: data.naam,
      email: data.email || null,
      telefoon: data.telefoon || null,
      mauticContactId: data.mauticContactId || null,
      status: data.status || "KIJKER",
      notities: data.notities || null,
      hypotheekAdviseurId: data.hypotheekAdviseurId || null,
    },
    include: {
      hypotheekAdviseur: { select: { id: true, naam: true, bedrijf: true } },
      _count: { select: { projecten: true } },
    },
  });

  return NextResponse.json({ success: true, lead }, { status: 201 });
}
