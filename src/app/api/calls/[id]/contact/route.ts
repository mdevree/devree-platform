import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * PATCH /api/calls/[id]/contact
 * Koppel of ontkoppel een Mautic contact aan/van een gesprek
 * Body: { mauticContactId: number | null, contactName?: string | null }
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
  const { mauticContactId, contactName } = await request.json();

  const call = await prisma.call.update({
    where: { id },
    data: {
      mauticContactId: mauticContactId ?? null,
      contactName: contactName ?? null,
    },
  });

  return NextResponse.json({ success: true, call });
}
