import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { startOfMonth, startOfQuarter, startOfYear } from "date-fns";

/**
 * GET /api/hypotheekadviseurs/[id]/stats?periode=maand|kwartaal|jaar|alles
 * Geaggregeerde statistieken voor een hypotheekadviseur
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const periode = request.nextUrl.searchParams.get("periode") || "alles";

  // Bereken de startdatum op basis van de geselecteerde periode
  const now = new Date();
  let dateFrom: Date | null = null;
  let periodeLabel = "Alles";

  switch (periode) {
    case "maand":
      dateFrom = startOfMonth(now);
      periodeLabel = "Deze maand";
      break;
    case "kwartaal":
      dateFrom = startOfQuarter(now);
      periodeLabel = "Dit kwartaal";
      break;
    case "jaar":
      dateFrom = startOfYear(now);
      periodeLabel = "Dit jaar";
      break;
    default:
      dateFrom = null;
      periodeLabel = "Alles";
  }

  // Bouw datum-filter
  const dateFilter = dateFrom ? { gte: dateFrom } : undefined;

  // Alle counts parallel uitvoeren
  const [
    leadsTotal,
    leadsConverted,
    leadsHypotheekAfgesloten,
    taxatiesTotal,
    taxatiesAfgerond,
    vveGesprekkenTotal,
  ] = await Promise.all([
    // Totaal doorverwezen leads
    prisma.lead.count({
      where: {
        hypotheekAdviseurId: id,
        ...(dateFilter && { hypotheekAdviseurDatum: dateFilter }),
      },
    }),
    // Leads met status CONVERTED
    prisma.lead.count({
      where: {
        hypotheekAdviseurId: id,
        status: "CONVERTED",
        ...(dateFilter && { hypotheekAdviseurDatum: dateFilter }),
      },
    }),
    // Leads waar hypotheek daadwerkelijk is afgesloten
    prisma.lead.count({
      where: {
        hypotheekAdviseurId: id,
        hypotheekAfgesloten: true,
        ...(dateFilter && { hypotheekAdviseurDatum: dateFilter }),
      },
    }),
    // Totaal taxatie-projecten
    prisma.project.count({
      where: {
        hypotheekAdviseurId: id,
        type: "TAXATIE",
        ...(dateFilter && { createdAt: dateFilter }),
      },
    }),
    // Afgeronde taxaties
    prisma.project.count({
      where: {
        hypotheekAdviseurId: id,
        type: "TAXATIE",
        projectStatus: "AFGEROND",
        ...(dateFilter && { createdAt: dateFilter }),
      },
    }),
    // VVE gesprekken
    prisma.vveGesprek.count({
      where: {
        hypotheekAdviseurId: id,
        ...(dateFilter && { datum: dateFilter }),
      },
    }),
  ]);

  return NextResponse.json({
    leads: {
      total: leadsTotal,
      converted: leadsConverted,
      hypotheekAfgesloten: leadsHypotheekAfgesloten,
    },
    taxaties: {
      total: taxatiesTotal,
      afgerond: taxatiesAfgerond,
    },
    vveGesprekken: {
      total: vveGesprekkenTotal,
    },
    periodeLabel,
  });
}
