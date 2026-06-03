import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { fetchWoningVanWordPress } from "@/lib/wordpress";

/**
 * GET /api/projecten/[id]/bezichtigingen
 *
 * Woning-centrisch overzicht: alle bezichtigingen van een woning, de gekoppelde
 * kijkers (Leads) en de WordPress woning-content in één respons.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, realworksId: true, woningAdres: true, woningPlaats: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Woning niet gevonden" }, { status: 404 });
  }

  const [bezichtigingen, koppelingen, woning] = await Promise.all([
    // Bezichtigingen van deze woning (type "bezichtiging", hoofdletterongevoelig)
    prisma.agendaAfspraak.findMany({
      where: { projectId: id, agtype: { contains: "bezichtiging" } },
      orderBy: { agbegin: "desc" },
      select: {
        id: true,
        agbegin: true,
        agend: true,
        agtype: true,
        agstatus: true,
        aglocation: true,
        medewerkerFullname: true,
        agowner: true,
        contactNaam: true,
        contactEmail: true,
        contactTelefoon: true,
        mauticContactId: true,
        leadId: true,
        enrichmentStatus: true,
        cheatsheetStatus: true,
        cheatsheetPath: true,
        cheatsheetUrl: true,
        lead: { select: { id: true, status: true, prioriteit: true } },
      },
    }),
    // Alle aan de woning gekoppelde kijkers (Leads)
    prisma.leadProject.findMany({
      where: { projectId: id },
      orderBy: { addedAt: "desc" },
      select: {
        addedAt: true,
        lead: {
          select: {
            id: true,
            naam: true,
            email: true,
            telefoon: true,
            status: true,
            prioriteit: true,
            mauticContactId: true,
          },
        },
      },
    }),
    project.realworksId ? fetchWoningVanWordPress(project.realworksId) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    project,
    bezichtigingen,
    kijkers: koppelingen.map((k) => ({ ...k.lead, gekoppeldOp: k.addedAt })),
    woning: woning
      ? {
          titel: woning.titel,
          link: woning.link,
          foto: woning.featuredImage,
          status: woning.acf?.status ?? null,
          koopsom: woning.acf?.koopsom ?? null,
          woonoppervlakte: woning.acf?.woonoppervlakte ?? null,
          kamers: woning.acf?.aantal_kamers ?? null,
          bouwjaar: woning.acf?.bouwjaar ?? null,
          energieklasse: woning.acf?.energieklasse ?? null,
        }
      : null,
  });
}
