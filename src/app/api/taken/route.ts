import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/taken
 * Haal taken op met filters
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const assigneeId = searchParams.get("assigneeId");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const category = searchParams.get("category");
  const projectId = searchParams.get("projectId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (assigneeId) where.assigneeId = assigneeId;
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;
  if (projectId) where.projectId = projectId;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, status: true } },
    },
    orderBy: [
      { status: "asc" },
      { priority: "desc" },
      { dueDate: "asc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json({ tasks });
}

/**
 * POST /api/taken
 * Maak een nieuwe taak aan
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.title) {
    return NextResponse.json(
      { error: "Titel is verplicht" },
      { status: 400 }
    );
  }

  if (!data.assigneeId) {
    return NextResponse.json(
      { error: "Toewijzing is verplicht" },
      { status: 400 }
    );
  }

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      priority: data.priority || "normaal",
      category: data.category || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assigneeId: data.assigneeId,
      creatorId: session.user.id,
      projectId: data.projectId || null,
      notionPageId: data.notionPageId || null,
    },
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ success: true, task }, { status: 201 });
}

/**
 * PATCH /api/taken
 * Werk een taak bij
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.id) {
    return NextResponse.json(
      { error: "Taak ID is verplicht" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.dueDate !== undefined)
    updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
  if (data.projectId !== undefined) updateData.projectId = data.projectId || null;
  if (data.notionPageId !== undefined) updateData.notionPageId = data.notionPageId;

  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "afgerond") {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }
  }

  const task = await prisma.task.update({
    where: { id: data.id },
    data: updateData,
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      creator: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ success: true, task });
}

/**
 * DELETE /api/taken
 * Verwijder een taak
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json(
      { error: "Taak ID is verplicht" },
      { status: 400 }
    );
  }

  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
