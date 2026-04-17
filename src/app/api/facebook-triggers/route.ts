import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/facebook-triggers
 *
 * Twee modi:
 * 1. n8n lookup: ?post_id=xxx → geeft { keyword, dmTekst } of 404
 * 2. Admin lijst: geen post_id → geeft alle triggers terug
 *
 * Query params (admin modus):
 * - actief: true | false
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const postId = searchParams.get("post_id");

  // n8n lookup modus
  if (postId) {
    const trigger = await prisma.facebookTrigger.findFirst({
      where: { postId, actief: true },
      select: { keyword: true, dmTekst: true },
    });

    if (!trigger) {
      return NextResponse.json(
        { error: "Geen actieve trigger gevonden" },
        { status: 404 }
      );
    }

    return NextResponse.json({ keyword: trigger.keyword, dmTekst: trigger.dmTekst });
  }

  // Admin lijst modus
  const actiefParam = searchParams.get("actief");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (actiefParam !== null) {
    where.actief = actiefParam === "true";
  }

  const triggers = await prisma.facebookTrigger.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, woningAdres: true, woningPlaats: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ triggers });
}

/**
 * POST /api/facebook-triggers
 * Maak een nieuwe trigger aan
 */
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  if (!data.postId || !data.keyword || !data.dmTekst) {
    return NextResponse.json(
      { error: "postId, keyword en dmTekst zijn verplicht" },
      { status: 400 }
    );
  }

  const trigger = await prisma.facebookTrigger.create({
    data: {
      postId: data.postId.trim(),
      keyword: data.keyword.trim().toLowerCase(),
      dmTekst: data.dmTekst,
      projectId: data.projectId || null,
    },
    include: {
      project: { select: { id: true, name: true, woningAdres: true, woningPlaats: true } },
    },
  });

  return NextResponse.json({ success: true, trigger }, { status: 201 });
}
