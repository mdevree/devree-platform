import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * POST /api/leads/bulk
 * Bulk-acties op meerdere leads tegelijk.
 *
 * Body: {
 *   ids: string[],
 *   action: "updateStatus" | "updatePrioriteit" | "addTag" | "removeTag" | "route",
 *
 *   -- bij updateStatus:
 *   status: "KIJKER" | "ZOEKER" | "CONVERTED" | "INACTIEF",
 *
 *   -- bij updatePrioriteit:
 *   prioriteit: "LAAG" | "NORMAAL" | "HOOG" | "URGENT",
 *
 *   -- bij addTag / removeTag:
 *   tag: string,
 *
 *   -- bij route:
 *   routeType: string,
 *   targetId?: string,
 *   targetNaam?: string,
 *   targetBedrijf?: string,
 *   notities?: string,
 *   routedById?: string,
 * }
 */
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();
  const { ids, action } = data;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] is verplicht en mag niet leeg zijn" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: "action is verplicht" }, { status: 400 });
  }

  let affected = 0;

  if (action === "updateStatus") {
    if (!data.status) {
      return NextResponse.json({ error: "status is verplicht bij updateStatus" }, { status: 400 });
    }
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { status: data.status },
    });
    affected = result.count;

  } else if (action === "updatePrioriteit") {
    if (!data.prioriteit) {
      return NextResponse.json({ error: "prioriteit is verplicht bij updatePrioriteit" }, { status: 400 });
    }
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { prioriteit: data.prioriteit },
    });
    affected = result.count;

  } else if (action === "addTag" || action === "removeTag") {
    if (!data.tag) {
      return NextResponse.json({ error: "tag is verplicht bij addTag/removeTag" }, { status: 400 });
    }
    // Per lead afzonderlijk verwerken (JSON array manipulatie)
    const leads = await prisma.lead.findMany({
      where: { id: { in: ids } },
      select: { id: true, tags: true },
    });

    await Promise.all(
      leads.map((lead) => {
        const currentTags: string[] = Array.isArray(lead.tags) ? (lead.tags as string[]) : [];
        const newTags =
          action === "addTag"
            ? currentTags.includes(data.tag) ? currentTags : [...currentTags, data.tag]
            : currentTags.filter((t) => t !== data.tag);
        return prisma.lead.update({
          where: { id: lead.id },
          data: { tags: newTags },
        });
      })
    );
    affected = leads.length;

  } else if (action === "route") {
    if (!data.routeType) {
      return NextResponse.json({ error: "routeType is verplicht bij route" }, { status: 400 });
    }
    const leads = await prisma.lead.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    await prisma.leadRoute.createMany({
      data: leads.map((lead) => ({
        leadId: lead.id,
        routeType: data.routeType,
        targetId: data.targetId || null,
        targetNaam: data.targetNaam || null,
        targetBedrijf: data.targetBedrijf || null,
        notities: data.notities || null,
        routedById: data.routedById || null,
      })),
    });

    // Sync hypotheekAdviseur op leads bij routeType hypotheekadviseur
    if (data.routeType === "hypotheekadviseur" && data.targetId) {
      await prisma.lead.updateMany({
        where: { id: { in: ids } },
        data: {
          hypotheekAdviseurId: data.targetId,
          hypotheekAdviseurDatum: new Date(),
        },
      });
    }

    affected = leads.length;

  } else {
    return NextResponse.json({ error: `Onbekende action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ success: true, affected });
}
