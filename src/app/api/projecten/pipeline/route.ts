import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/projecten/pipeline
 * Haal projecten op per type voor de pipeline kanban (Aankoop/Taxatie).
 *
 * Query params:
 * - type: AANKOOP | TAXATIE (verplicht)
 * - search: vrije tekst op projectnaam of contactnaam
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type");
  const search = searchParams.get("search") || "";

  if (!type || !["VERKOOP", "AANKOOP", "TAXATIE"].includes(type)) {
    return NextResponse.json({ error: "Ongeldig type" }, { status: 400 });
  }

  const where: Record<string, unknown> = {
    type,
    projectStatus: { notIn: ["AFGEROND", "GEANNULEERD"] },
  };

  if (search.trim()) {
    where.OR = [
      { name: { contains: search.trim() } },
      { address: { contains: search.trim() } },
      { contactName: { contains: search.trim() } },
    ];
  }

  const projecten = await prisma.project.findMany({
    where,
    include: {
      contacts: {
        orderBy: { addedAt: "asc" },
        take: 3,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Serialiseer voor JSON (Date → string)
  const result = projecten.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    projectStatus: p.projectStatus,
    status: p.status,
    address: p.address,
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    realworksId: p.realworksId,
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    contacts: p.contacts.map((c) => ({
      mauticContactId: c.mauticContactId,
      role: c.role,
    })),
  }));

  return NextResponse.json({ projects: result, total: result.length });
}
