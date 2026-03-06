import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/hypotheekadviseurs/[id]
 * Haal een enkele hypotheekadviseur op met statistieken
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const adviseur = await prisma.hypotheekAdviseur.findUnique({
    where: { id },
    include: {
      _count: { select: { leads: true, projecten: true, vveGesprekken: true } },
      leads: {
        select: { id: true, naam: true, status: true, hypotheekAfgesloten: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      projecten: {
        select: { id: true, name: true, type: true, projectStatus: true, createdAt: true },
        where: { type: "TAXATIE" },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      vveGesprekken: {
        select: { id: true, datum: true, naam: true, omschrijving: true, createdAt: true },
        orderBy: { datum: "desc" },
        take: 10,
      },
    },
  });

  if (!adviseur) {
    return NextResponse.json({ error: "Adviseur niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ adviseur });
}

/**
 * PATCH /api/hypotheekadviseurs/[id]
 * Werk een hypotheekadviseur bij
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
  if (data.bedrijf !== undefined) updateData.bedrijf = data.bedrijf || null;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.telefoon !== undefined) updateData.telefoon = data.telefoon || null;
  if (data.notities !== undefined) updateData.notities = data.notities || null;
  if (data.actief !== undefined) updateData.actief = data.actief;

  const adviseur = await prisma.hypotheekAdviseur.update({
    where: { id },
    data: updateData,
    include: {
      _count: { select: { leads: true, projecten: true, vveGesprekken: true } },
    },
  });

  return NextResponse.json({ success: true, adviseur });
}

/**
 * DELETE /api/hypotheekadviseurs/[id]
 * Verwijder een hypotheekadviseur (hard delete als geen koppelingen, anders 409)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const adviseur = await prisma.hypotheekAdviseur.findUnique({
    where: { id },
    include: {
      _count: { select: { leads: true, projecten: true, vveGesprekken: true } },
    },
  });

  if (!adviseur) {
    return NextResponse.json({ error: "Adviseur niet gevonden" }, { status: 404 });
  }

  if (adviseur._count.leads > 0 || adviseur._count.projecten > 0) {
    return NextResponse.json(
      {
        error: "Adviseur heeft nog koppelingen",
        hint: "Deactiveer de adviseur via PATCH { actief: false } of verwijder eerst alle koppelingen",
        counts: { leads: adviseur._count.leads, projecten: adviseur._count.projecten },
      },
      { status: 409 }
    );
  }

  await prisma.hypotheekAdviseur.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
