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

  // Datumgrenzen voor de herwarm-bucket: contacten die 3–6 maanden stil zijn.
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const driemaanden = ymd(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const zesmaanden = ymd(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));

  try {
    // Recente contacten: voeden hete kopers + opdrachtkansen.
    const { contacts: recent } = await searchContactsWithPipeline({
      limit,
      orderBy: "last_active",
      orderByDir: "desc",
    });

    // Stilgevallen contacten (3–6 mnd geleden laatst actief): voeden herwarmen.
    // Aparte query nodig omdat de recente lijst deze per definitie niet bevat.
    const { contacts: stil } = await searchContactsWithPipeline({
      limit,
      orderBy: "last_active",
      orderByDir: "desc",
      lastActiveAfter: zesmaanden,
      lastActiveBefore: driemaanden,
    });

    // Samenvoegen en dedupliceren op contact-id.
    const gezien = new Set<number>();
    const contacts = [...recent, ...stil].filter((c) => {
      if (gezien.has(c.id)) return false;
      gezien.add(c.id);
      return true;
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
      const metEmail = contacts.filter((c) => c.email).length;
      return NextResponse.json({
        onderzocht: contacts.length,
        herwarmVenster: { van: zesmaanden, tot: driemaanden, gevonden: stil.length },
        statistiek: {
          metPunten: withPoints,
          maxPunten: maxPoints,
          maxWarmScore: maxWarm,
          metBezichtigingInteresse: withInteresse,
          metKijkerEigenWoning: withEigenWoning,
          metLastActive: withLastActive,
          metEmail,
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
