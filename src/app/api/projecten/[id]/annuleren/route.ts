import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

class CancellationConflict extends Error {}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthorized(request)) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const lastSeen = new Date(typeof body?.updatedAt === "string" ? body.updatedAt : "");
  if (!reason || reason.length > 191 || Number.isNaN(lastSeen.getTime())) {
    return NextResponse.json({ error: "Geef een reden op (maximaal 191 tekens) en ververs zo nodig het dossier." }, { status: 400 });
  }

  try {
    const revoked = await prisma.$transaction(async (tx) => {
      const result = await tx.project.updateMany({
        where: { id, updatedAt: lastSeen, OR: [{ projectStatus: null }, { projectStatus: { notIn: ["AFGEROND", "GEANNULEERD"] } }] },
        data: { status: "geannuleerd", projectStatus: "GEANNULEERD", cancelledAt: new Date(), cancellationReason: reason },
      });
      if (!result.count) throw new CancellationConflict("Dit dossier is gewijzigd of afgesloten. Ververs de pagina.");
      const links = await tx.projectProposal.updateMany({
        where: { projectId: id, status: "OPEN" },
        data: { status: "REVOKED", errorMessage: "Project geannuleerd" },
      });
      if (await tx.projectProposal.count({ where: { projectId: id, status: "ACCEPTING" } })) {
        throw new CancellationConflict("Een akkoord wordt nu verwerkt. Ververs het dossier en probeer het opnieuw.");
      }
      return links.count;
    });
    return NextResponse.json({ success: true, revoked });
  } catch (e) {
    if (e instanceof CancellationConflict) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
