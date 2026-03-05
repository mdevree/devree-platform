import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * POST /api/leads/[id]/projecten
 * Koppel een project aan een lead
 * Body: { projectId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { projectId } = await request.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  const koppeling = await prisma.leadProject.upsert({
    where: { leadId_projectId: { leadId: id, projectId } },
    update: {},
    create: { leadId: id, projectId },
    include: {
      project: {
        select: { id: true, name: true, type: true, projectStatus: true, woningAdres: true },
      },
    },
  });

  return NextResponse.json({ success: true, koppeling }, { status: 201 });
}

/**
 * DELETE /api/leads/[id]/projecten
 * Ontkoppel een project van een lead
 * Body: { projectId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { projectId } = await request.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  await prisma.leadProject.delete({
    where: { leadId_projectId: { leadId: id, projectId } },
  });

  return NextResponse.json({ success: true });
}
