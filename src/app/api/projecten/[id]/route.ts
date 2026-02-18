import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/projecten/[id]
 * Haal een enkel project op met alle taken en calls
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contacts: {
        orderBy: { addedAt: "asc" },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, role: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      },
      calls: {
        include: {
          _count: { select: { notes: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 50,
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: "Project niet gevonden" },
      { status: 404 }
    );
  }

  return NextResponse.json({ project });
}
