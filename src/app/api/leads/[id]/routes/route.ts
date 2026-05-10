import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads/[id]/routes
 * Routeringshistorie van een lead.
 * Query params: limit (default 50)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);

  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
  if (!lead) {
    return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
  }

  const routes = await prisma.leadRoute.findMany({
    where: { leadId: id },
    orderBy: { routedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ routes });
}

/**
 * POST /api/leads/[id]/route
 * Stuur een lead door naar een bestemming.
 * Body: {
 *   routeType: "hypotheekadviseur" | "makelaar" | "extern",
 *   targetId?: string,
 *   targetNaam?: string,
 *   targetBedrijf?: string,
 *   notities?: string,
 *   routedById?: string,
 *   -- bij routeType "hypotheekadviseur" ook hypotheekAdviseurId updaten:
 *   updateLead?: boolean  (default true — update hypotheekAdviseurId op lead)
 * }
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

  if (!data.routeType) {
    return NextResponse.json({ error: "routeType is verplicht" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
  }

  const route = await prisma.leadRoute.create({
    data: {
      leadId: id,
      routeType: data.routeType,
      targetId: data.targetId || null,
      targetNaam: data.targetNaam || null,
      targetBedrijf: data.targetBedrijf || null,
      notities: data.notities || null,
      routedById: data.routedById || null,
    },
  });

  // Sync hypotheekAdviseur op de lead bij routeType hypotheekadviseur
  const shouldUpdateLead = data.updateLead !== false;
  if (shouldUpdateLead && data.routeType === "hypotheekadviseur" && data.targetId) {
    await prisma.lead.update({
      where: { id },
      data: {
        hypotheekAdviseurId: data.targetId,
        hypotheekAdviseurDatum: new Date(),
      },
    });
  }

  return NextResponse.json({ success: true, route }, { status: 201 });
}
