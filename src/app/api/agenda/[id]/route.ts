import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/agenda/[id]
 *
 * Verwijdert een afspraak handmatig uit het platform. Bedoeld voor
 * bezichtigingen die in Realworks zijn verwijderd maar via de sync (die een
 * window scrapet, geen volledige snapshot) niet automatisch verdwijnen.
 *
 * De gekoppelde Lead (kijker) blijft bestaan; alleen de afspraak wordt
 * verwijderd.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!afspraak)
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });

  await prisma.agendaAfspraak.delete({ where: { id } });

  return NextResponse.json({ ok: true, id });
}
