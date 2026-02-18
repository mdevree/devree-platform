import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * POST /api/projecten/[id]/contacts
 * Koppel een Mautic contact aan een project
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const data = await request.json();

  if (!data.mauticContactId) {
    return NextResponse.json(
      { error: "mauticContactId is verplicht" },
      { status: 400 }
    );
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const contact = await prisma.projectContact.upsert({
    where: {
      projectId_mauticContactId: {
        projectId,
        mauticContactId: data.mauticContactId,
      },
    },
    update: {
      role: data.role || "opdrachtgever",
      label: data.label || null,
    },
    create: {
      projectId,
      mauticContactId: data.mauticContactId,
      role: data.role || "opdrachtgever",
      label: data.label || null,
      addedBy: session.user?.email || null,
    },
  });

  return NextResponse.json({ success: true, contact }, { status: 201 });
}

/**
 * DELETE /api/projecten/[id]/contacts
 * Ontkoppel een Mautic contact van een project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const data = await request.json();

  if (!data.mauticContactId) {
    return NextResponse.json(
      { error: "mauticContactId is verplicht" },
      { status: 400 }
    );
  }

  await prisma.projectContact.delete({
    where: {
      projectId_mauticContactId: {
        projectId,
        mauticContactId: data.mauticContactId,
      },
    },
  });

  return NextResponse.json({ success: true });
}
