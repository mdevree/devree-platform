import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads/[id]
 * Haal een enkele lead op met gekoppelde projecten
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      hypotheekAdviseur: true,
      projecten: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              type: true,
              projectStatus: true,
              woningAdres: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ lead });
}

/**
 * PATCH /api/leads/[id]
 * Werk een lead bij
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (data.naam !== undefined) updateData.naam = data.naam;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.telefoon !== undefined) updateData.telefoon = data.telefoon || null;
  if (data.mauticContactId !== undefined) updateData.mauticContactId = data.mauticContactId || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notities !== undefined) updateData.notities = data.notities || null;
  if (data.hypotheekAdviseurDatum !== undefined) {
    updateData.hypotheekAdviseurDatum = data.hypotheekAdviseurDatum ? new Date(data.hypotheekAdviseurDatum) : null;
  }

  // hypotheekAdviseurId via connect/disconnect
  if (data.hypotheekAdviseurId !== undefined) {
    updateData.hypotheekAdviseur = data.hypotheekAdviseurId
      ? { connect: { id: data.hypotheekAdviseurId } }
      : { disconnect: true };
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: updateData,
    include: {
      hypotheekAdviseur: { select: { id: true, naam: true, bedrijf: true } },
      _count: { select: { projecten: true } },
    },
  });

  return NextResponse.json({ success: true, lead });
}

/**
 * DELETE /api/leads/[id]
 * Verwijder een lead (LeadProject cascade via schema)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
  }

  await prisma.lead.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
