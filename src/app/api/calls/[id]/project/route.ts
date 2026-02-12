import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * PATCH /api/calls/[id]/project
 * Koppel of ontkoppel een gesprek aan/van een project
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { projectId } = await request.json();

  const call = await prisma.call.update({
    where: { id },
    data: { projectId: projectId || null },
    include: {
      project: { select: { id: true, name: true, status: true } },
    },
  });

  return NextResponse.json({ success: true, call });
}
