import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const van = searchParams.get("van");
  const tot = searchParams.get("tot");
  const type = searchParams.get("type");
  const medewerker = searchParams.get("medewerker");

  const where: Record<string, unknown> = {
    aginactive: { not: true },
  };

  if (van || tot) {
    where.agbegin = {
      ...(van ? { gte: new Date(van) } : {}),
      ...(tot ? { lte: new Date(tot) } : {}),
    };
  }

  if (type && type !== "alle") {
    where.agtype = type;
  }

  if (medewerker && medewerker !== "alle") {
    // Fullname wordt gestuurd vanuit de frontend – filter op beide velden
    where.OR = [
      { medewerkerFullname: medewerker },
      { agowner: medewerker },
    ];
  }

  const afspraken = await prisma.agendaAfspraak.findMany({
    where,
    orderBy: { agbegin: "asc" },
    include: {
      project: {
        select: { id: true, name: true, woningAdres: true, woningPlaats: true },
      },
    },
  });

  // Auto-koppel projecten op basis van agobjcode voor afspraken zonder projectId
  type AfspraakResult = { id: string; agobjcode: string | null; projectId: string | null; project: unknown };
  type ProjectSelectResult = { id: string; name: string; woningAdres: string | null; woningPlaats: string | null; realworksId: string | null };
  const afsprakenTyped = afspraken as AfspraakResult[];
  const teKoppelen = afsprakenTyped.filter((a: AfspraakResult) => a.agobjcode && !a.projectId);
  if (teKoppelen.length > 0) {
    const codes = [...new Set(teKoppelen.map((a: AfspraakResult) => a.agobjcode as string))];
    const projecten: ProjectSelectResult[] = await prisma.project.findMany({
      where: { realworksId: { in: codes } },
      select: { id: true, name: true, woningAdres: true, woningPlaats: true, realworksId: true },
    });
    const projectPerCode = new Map<string, ProjectSelectResult>(
      projecten.filter((p) => p.realworksId).map((p) => [p.realworksId as string, p])
    );

    const teUpdaten = teKoppelen.filter((a: AfspraakResult) => projectPerCode.has(a.agobjcode as string));
    if (teUpdaten.length > 0) {
      // Sla projectId op in de achtergrond (fire-and-forget)
      void Promise.all(
        teUpdaten.map((a: AfspraakResult) => {
          const proj = projectPerCode.get(a.agobjcode as string)!;
          return prisma.agendaAfspraak.update({
            where: { id: a.id },
            data: { projectId: proj.id },
          });
        })
      );
      // Voeg project meteen toe aan de response
      for (const a of afsprakenTyped) {
        if (!a.projectId && a.agobjcode) {
          const p = projectPerCode.get(a.agobjcode);
          if (p) {
            (a as unknown as Record<string, unknown>).project = {
              id: p.id,
              name: p.name,
              woningAdres: p.woningAdres,
              woningPlaats: p.woningPlaats,
            };
          }
        }
      }
    }
  }

  return NextResponse.json(afspraken);
}
