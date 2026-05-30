import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { woningSlugVanUrl } from "@/lib/woningUrl";

/**
 * GET /api/kansen/actieve-interesse
 *
 * Leest recente page.hit-events (MauticEvent) en bundelt ze per contact + woning,
 * zodat zichtbaar wordt welke geïdentificeerde leads NU een specifieke woning
 * (meermaals) bekijken — een trigger voor een persoonlijk belletje/WhatsApp.
 *
 * Query params:
 * - dagen: terugkijkperiode (default 7)
 * - minBezoeken: minimaal aantal bezoeken aan dezelfde woning (default 2)
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const dagen = parseInt(request.nextUrl.searchParams.get("dagen") || "7");
  const minBezoeken = parseInt(
    request.nextUrl.searchParams.get("minBezoeken") || "2"
  );
  const sinds = new Date(Date.now() - dagen * 24 * 60 * 60 * 1000);

  const events = await prisma.mauticEvent.findMany({
    where: { eventType: "page.hit", occurredAt: { gte: sinds } },
    orderBy: { occurredAt: "desc" },
    take: 2000,
  });

  // Bundel per contact + woning-slug.
  type Bucket = {
    mauticContactId: number;
    slug: string;
    bezoeken: number;
    laatsteBezoek: string;
    voorbeeldUrl: string;
  };
  const map = new Map<string, Bucket>();

  for (const e of events) {
    const slug = woningSlugVanUrl(e.clickedUrl);
    if (!slug) continue;
    const key = `${e.mauticContactId}::${slug}`;
    const bestaand = map.get(key);
    if (bestaand) {
      bestaand.bezoeken += 1;
    } else {
      map.set(key, {
        mauticContactId: e.mauticContactId,
        slug,
        bezoeken: 1,
        laatsteBezoek: e.occurredAt.toISOString(),
        voorbeeldUrl: e.clickedUrl || "",
      });
    }
  }

  const feed = Array.from(map.values())
    .filter((b) => b.bezoeken >= minBezoeken)
    .sort(
      (a, b) =>
        b.bezoeken - a.bezoeken ||
        +new Date(b.laatsteBezoek) - +new Date(a.laatsteBezoek)
    );

  return NextResponse.json({ feed, periodeDagen: dagen, minBezoeken });
}
