import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { koppelAfspraakAanLead } from "@/lib/kijkerKoppeling";

/**
 * POST /api/agenda/[id]/lead
 *
 * Koppelt de bezichtiging handmatig aan een kijker (Lead) in het kijker-systeem
 * en hangt die aan de woning. Idempotent; gebruikt dezelfde brug als de
 * automatische koppeling tijdens enrich.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak)
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });

  const resultaat = await koppelAfspraakAanLead(afspraak);
  if (!resultaat) {
    return NextResponse.json(
      { error: "Onvoldoende contactgegevens om een kijker te koppelen. Verrijk de afspraak eerst." },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, ...resultaat });
}
