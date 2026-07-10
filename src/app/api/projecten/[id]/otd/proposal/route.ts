import { NextRequest, NextResponse } from "next/server";
import { Verkoopstart } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const VERKOOPSTART_VALUES = new Set<Verkoopstart>(["DIRECT", "UITGESTELD", "SLAPEND"]);

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();
  const verkoopstart = (cleanString(data.verkoopstart) || "DIRECT") as Verkoopstart;

  if (!VERKOOPSTART_VALUES.has(verkoopstart)) {
    return NextResponse.json({ error: "Ongeldige verkoopstart" }, { status: 400 });
  }

  const existing = await prisma.project.findUnique({ where: { id }, select: { type: true } });
  if (existing?.type === "AANKOOP") {
    return NextResponse.json({ error: "Niet beschikbaar voor aankoopprojecten" }, { status: 400 });
  }

  const project = await prisma.project.update({
    where: { id },
    data: {
      projectStatus: "OFFERTE_VERSTUURD",
      verkoopstart,
      startdatum: verkoopstart === "DIRECT" || !data.startdatum ? null : new Date(data.startdatum),
      startReden: verkoopstart === "DIRECT" ? null : cleanString(data.startReden),
    },
  });

  return NextResponse.json({
    success: true,
    project,
    proposal: {
      status: "OFFERTE_VERSTUURD",
      verkoopstart: project.verkoopstart,
      startdatum: project.startdatum,
      startReden: project.startReden,
    },
  });
}
