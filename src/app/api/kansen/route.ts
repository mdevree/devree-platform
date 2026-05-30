import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { searchContactsWithPipeline } from "@/lib/mautic";
import { groupKansen } from "@/lib/kansen";

/**
 * GET /api/kansen
 * Leest Mautic-pipelinecontacten en groepeert ze per kans-type (hete kopers,
 * opdrachtkansen, herwarmen), gesorteerd op Mautic's eigen warmScore/punten.
 * De scoring zelf blijft in Mautic; dit endpoint classificeert en presenteert alleen.
 *
 * Query params:
 * - limit: aantal Mautic-contacten om te onderzoeken (default 200)
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "200");
  const debug = request.nextUrl.searchParams.get("debug") === "1";

  try {
    const { contacts } = await searchContactsWithPipeline({
      limit,
      orderBy: "last_active",
      orderByDir: "desc",
    });

    // Diagnose-modus: laat zien wat er écht in de Mautic-velden zit, zodat we
    // kunnen bepalen of kansen leeg zijn door ontbrekende data of door mapping.
    if (debug) {
      const withPoints = contacts.filter((c) => c.points > 0).length;
      const withInteresse = contacts.filter(
        (c) => c.bezichtigingInteresse !== null
      ).length;
      const withEigenWoning = contacts.filter(
        (c) => c.kijkerEigenWoning !== null
      ).length;
      const withLastActive = contacts.filter((c) => c.lastActive).length;
      const maxPoints = contacts.reduce((m, c) => Math.max(m, c.points), 0);
      const maxWarm = contacts.reduce((m, c) => Math.max(m, c.warmScore), 0);
      return NextResponse.json({
        onderzocht: contacts.length,
        statistiek: {
          metPunten: withPoints,
          maxPunten: maxPoints,
          maxWarmScore: maxWarm,
          metBezichtigingInteresse: withInteresse,
          metKijkerEigenWoning: withEigenWoning,
          metLastActive: withLastActive,
        },
        voorbeelden: contacts.slice(0, 5).map((c) => ({
          id: c.id,
          naam: `${c.firstname} ${c.lastname}`.trim(),
          points: c.points,
          warmScore: c.warmScore,
          lastActive: c.lastActive,
          bezichtigingInteresse: c.bezichtigingInteresse,
          kijkerEigenWoning: c.kijkerEigenWoning,
          kijkerOverwegtVerkoop: c.kijkerOverwegtVerkoop,
        })),
      });
    }

    const groepen = groupKansen(contacts);
    const totaal = groepen.reduce((sum, g) => sum + g.items.length, 0);

    return NextResponse.json({ groepen, totaal, onderzocht: contacts.length });
  } catch (error) {
    console.error("Kansen ophalen mislukt:", error);
    return NextResponse.json(
      { error: "Kon kansen niet ophalen uit Mautic" },
      { status: 502 }
    );
  }
}
