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

  try {
    const { contacts } = await searchContactsWithPipeline({
      limit,
      orderBy: "last_active",
      orderByDir: "desc",
    });

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
