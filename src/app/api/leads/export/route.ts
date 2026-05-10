import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads/export
 * Exporteer leads als CSV.
 * Ondersteunt dezelfde filters als GET /api/leads:
 * status, source, prioriteit, tags, search, dateFrom, dateTo
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (status) where.status = status;
  if (source) where.source = source;
  if (prioriteit) where.prioriteit = prioriteit;

  if (tags) {
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

  const leads = await prisma.lead.findMany({
    where,
    include: {
      hypotheekAdviseur: { select: { naam: true, bedrijf: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const headers = [
    "id",
    "naam",
    "email",
    "telefoon",
    "status",
    "prioriteit",
    "source",
    "tags",
    "mauticContactId",
    "hypotheekAdviseur",
    "hypotheekAdviseurBedrijf",
    "hypotheekAdviseurDatum",
    "hypotheekAfgesloten",
    "notities",
    "aangemaakt",
    "bijgewerkt",
  ];

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val).replace(/"/g, '""');
    return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
  };

  const rows = leads.map((l) => [
    l.id,
    l.naam,
    l.email ?? "",
    l.telefoon ?? "",
    l.status,
    l.prioriteit,
    l.source ?? "",
    Array.isArray(l.tags) ? (l.tags as string[]).join("|") : "",
    l.mauticContactId ?? "",
    l.hypotheekAdviseur?.naam ?? "",
    l.hypotheekAdviseur?.bedrijf ?? "",
    l.hypotheekAdviseurDatum ? l.hypotheekAdviseurDatum.toISOString() : "",
    l.hypotheekAfgesloten ? "ja" : "nee",
    (l.notities ?? "").replace(/\n/g, " "),
    l.createdAt.toISOString(),
    l.updatedAt.toISOString(),
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
