import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/projecten
 * Haal projecten op met filters
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { contactName: { contains: search } },
      { contactEmail: { contains: search } },
    ];
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        _count: { select: { tasks: true, calls: true } },
        calls: { select: { id: true, _count: { select: { notes: true } } } },
        tasks: { select: { totalTimeSpent: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  // Bereken totale tijd per project
  const projectsWithTime = projects.map((p) => ({
    ...p,
    totalTimeSpent: p.tasks.reduce((sum, t) => sum + t.totalTimeSpent, 0),
    tasks: undefined, // verwijder ruwe tasks array uit response
  }));

  return NextResponse.json({
    projects: projectsWithTime,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/projecten
 * Maak een nieuw project aan
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.name) {
    return NextResponse.json(
      { error: "Projectnaam is verplicht" },
      { status: 400 }
    );
  }

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description || null,
      status: data.status || "lead",
      address: data.address || null,
      notionPageId: data.notionPageId || null,
      mauticContactId: data.mauticContactId || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
    },
    include: {
      _count: { select: { tasks: true, calls: true } },
    },
  });

  return NextResponse.json({ success: true, project }, { status: 201 });
}

/**
 * PATCH /api/projecten
 * Werk een project bij
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.id) {
    return NextResponse.json(
      { error: "Project ID is verplicht" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.notionPageId !== undefined) updateData.notionPageId = data.notionPageId;
  if (data.mauticContactId !== undefined) updateData.mauticContactId = data.mauticContactId;
  if (data.contactName !== undefined) updateData.contactName = data.contactName;
  if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
  if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;

  const project = await prisma.project.update({
    where: { id: data.id },
    data: updateData,
    include: {
      _count: { select: { tasks: true, calls: true } },
    },
  });

  return NextResponse.json({ success: true, project });
}

/**
 * DELETE /api/projecten
 * Verwijder een project (ontkoppelt taken en calls eerst)
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json(
      { error: "Project ID is verplicht" },
      { status: 400 }
    );
  }

  // Ontkoppel taken en calls, verwijder dan het project
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    }),
    prisma.call.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    }),
    prisma.project.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
