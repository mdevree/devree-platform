import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads
 * Query params:
 * - status: KIJKER | ZOEKER | CONVERTED | INACTIEF
 * - source: WEBSITE | SOCIAL | TELEFOON | EMAIL | DOORVERWIJZING | HANDMATIG | API
 * - prioriteit: LAAG | NORMAAL | HOOG | URGENT
 * - tags: komma-gescheiden lijst van tags
 * - search: zoekterm (naam, email, telefoon)
 * - dateFrom, dateTo: ISO datumstrings (filter op createdAt)
 * - sort: createdAt | naam | prioriteit (default: createdAt)
 * - order: asc | desc (default: desc)
 * - page, limit: paginatie
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const p = request.nextUrl.searchParams;
  const status = p.get("status");
  const source = p.get("source");
  const prioriteit = p.get("prioriteit");
  const tags = p.get("tags");
  const search = p.get("search");
  const dateFrom = p.get("dateFrom");
  const dateTo = p.get("dateTo");
  const sort = p.get("sort") || "createdAt";
  const order = (p.get("order") || "desc") as "asc" | "desc";
  const page = parseInt(p.get("page") || "1");
  const limit = Math.min(parseInt(p.get("limit") || "24"), 100);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (status) where.status = status;
  if (source) where.source = source;
  if (prioriteit) where.prioriteit = prioriteit;

  if (tags) {
    // JSON_CONTAINS filter voor elke tag
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      where.AND = tagList.map((tag) => ({
        tags: { path: "$", array_contains: tag },
      }));
    }
  }

  if (search) {
    where.OR = [
      { naam: { contains: search } },
      { email: { contains: search } },
      { telefoon: { contains: search } },
    ];
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const allowedSort = ["createdAt", "naam", "prioriteit", "updatedAt"];
  const orderBy = allowedSort.includes(sort) ? { [sort]: order } : { createdAt: "desc" as const };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        hypotheekAdviseur: { select: { id: true, naam: true, bedrijf: true } },
        _count: { select: { projecten: true, routes: true } },
      },
      orderBy,
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
 * Body: { naam, email?, telefoon?, mauticContactId?, status?, prioriteit?, source?, tags?, notities?, hypotheekAdviseurId? }
 */
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.naam) {
    return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
  }

  const lead = await prisma.lead.create({
    data: {
      naam: data.naam,
      email: data.email || null,
      telefoon: data.telefoon || null,
      mauticContactId: data.mauticContactId || null,
      status: data.status || "KIJKER",
      prioriteit: data.prioriteit || "NORMAAL",
      source: data.source || null,
      tags: data.tags || null,
      notities: data.notities || null,
      hypotheekAdviseurId: data.hypotheekAdviseurId || null,
    },
    include: {
      hypotheekAdviseur: { select: { id: true, naam: true, bedrijf: true } },
      _count: { select: { projecten: true, routes: true } },
    },
  });

  return NextResponse.json({ success: true, lead }, { status: 201 });
}
