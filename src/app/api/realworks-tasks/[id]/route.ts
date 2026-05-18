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

  // Claim is alleen geldig als de huidige status nog "pending" is.
  // Zo wordt voorkomen dat meerdere extensies dezelfde taak dubbel uitvoeren.
  const whereClause =
    status === "processing"
      ? { id, status: "pending" }
      : { id };

  const updated = await prisma.realworksTask.updateMany({
    where: whereClause,
    data: {
      status,
      error: error ?? null,
      processedAt: status === "done" || status === "failed" ? new Date() : null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Taak kon niet worden geclaimd (al in behandeling of afgerond)" },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
