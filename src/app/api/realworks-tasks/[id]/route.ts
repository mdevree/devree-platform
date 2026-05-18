import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * PATCH /api/realworks-tasks/[id]
 * De browser extensie markeert een taak als afgehandeld of mislukt.
 *
 * Body:
 *   status  - "processing" | "done" | "failed"
 *   error   - foutmelding (alleen bij status=failed)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { status, error } = await request.json();

  if (!["processing", "done", "failed"].includes(status)) {
    return NextResponse.json(
      { error: "status moet processing, done of failed zijn" },
      { status: 400 }
    );
  }

  const task = await prisma.realworksTask.update({
    where: { id },
    data: {
      status,
      error: error ?? null,
      processedAt: status === "done" || status === "failed" ? new Date() : null,
    },
  });

  return NextResponse.json({ success: true, task });
}
