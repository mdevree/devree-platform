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
    where.agowner = medewerker;
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

  return NextResponse.json(afspraken);
}
