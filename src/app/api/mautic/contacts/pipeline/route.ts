import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { searchContactsWithPipeline } from "@/lib/mautic";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/mautic/contacts/pipeline
 * Haal contacten op met pipeline-velden, verrijkt met lokale project-koppeling.
 *
 * Query params:
 * - segment: filter op segment_prioriteit (a_sweetspot, b_volledig, c_recent, d_oud)
 * - stage: filter op verkoopgesprek_status (gepland, gehad, followup_verstuurd, etc.)
 * - search: vrije tekst zoekterm
 * - start: paginatie offset
 * - limit: aantal resultaten (default 100)
 * - orderBy: veld om op te sorteren (default: last_active)
 * - orderByDir: asc of desc (default: desc)
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const segment = searchParams.get("segment") || undefined;
  const stage = searchParams.get("stage") || undefined;
  const search = searchParams.get("search") || "";
  const start = parseInt(searchParams.get("start") || "0");
  const limit = parseInt(searchParams.get("limit") || "100");
  const orderBy = searchParams.get("orderBy") || "last_active";
  const orderByDir = (searchParams.get("orderByDir") || "desc") as "asc" | "desc";

  // Haal contacten op uit Mautic
  const result = await searchContactsWithPipeline({
    search,
    stage,
    segment,
    start,
    limit,
    orderBy,
    orderByDir,
  });

  // Verrijk contacten met lokale project-koppeling
  if (result.contacts && result.contacts.length > 0) {
    const mauticIds = result.contacts.map((c: { id: number }) => c.id);

    const linkedContacts = await prisma.projectContact.findMany({
      where: { mauticContactId: { in: mauticIds } },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            projectStatus: true,
            status: true,
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    // Bouw lookup map: mauticContactId → meest recente project
    const projectByContact: Record<number, {
      id: string;
      name: string;
      type: string;
      projectStatus: string | null;
      status: string;
    }> = {};
    for (const lc of linkedContacts) {
      if (!projectByContact[lc.mauticContactId]) {
        projectByContact[lc.mauticContactId] = lc.project;
      }
    }

    result.contacts = result.contacts.map((c: { id: number }) => ({
      ...c,
      linkedProject: projectByContact[c.id] || null,
    }));
  }

  return NextResponse.json(result);
}
