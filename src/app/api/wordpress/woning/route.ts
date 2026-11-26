import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

import { findWoningByRealworksId, WP_BASE_URL, type WoningACF } from "@/lib/wordpressWoning";

function wpAuthHeader(): string {
  const user = process.env.WP_API_USER;
  const pass = process.env.WP_API_PASSWORD;
  if (!user || !pass) throw new Error("WP_API_USER of WP_API_PASSWORD ontbreekt in .env");
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

/**
 * GET /api/wordpress/woning?realworksId=SE11776
 * Haalt woning op van WordPress op basis van Realworks ID
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const realworksId = searchParams.get("realworksId");

  if (!realworksId) {
    return NextResponse.json({ error: "realworksId is verplicht" }, { status: 400 });
  }

  try {
    const { woning, errorStatus } = await findWoningByRealworksId(realworksId);

    if (errorStatus) {
      return NextResponse.json(
        { error: `WordPress API fout: ${errorStatus}` },
        { status: errorStatus }
      );
    }

    if (!woning) {
      // "Niet gevonden" is een normaal resultaat van deze lookup: veel
      // agenda-objecten (gesprekken, taxaties, niet-gepubliceerde woningen)
      // hebben een objectcode die niet als woning op de website staat. Geef
      // daarom 200 met een leeg resultaat terug i.p.v. 404, zodat de console
      // niet volloopt met 404-netwerkfouten.
      return NextResponse.json({ found: false, error: "Geen woning gevonden met dit Realworks ID" });
    }

    // Featured image: probeer _embedded, dan og_image als fallback
    const featuredImage =
      woning._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.large?.source_url ||
      woning._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.medium_large?.source_url ||
      woning._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
      woning.yoast_head_json?.og_image?.[0]?.url ||
      null;

    return NextResponse.json({
      id: woning.id,
      slug: woning.slug,
      link: woning.link,
      title: woning.title.rendered,
      featuredImage,
      acf: woning.acf,
    });
  } catch (error) {
    console.error("WordPress woning fetch fout:", error);
    return NextResponse.json({ error: "Kan WordPress niet bereiken" }, { status: 500 });
  }
}

/**
 * PATCH /api/wordpress/woning
 * Werkt velden bij op een woning in WordPress.
 * Body: { wpPostId: number, title?: string, slug?: string, postStatus?: string, acf: Partial<WoningACF> }
 *
 * Vereist WP_API_USER en WP_API_PASSWORD in .env (WordPress Application Password)
 */
export async function PATCH(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { wpPostId, title, slug, postStatus, acf } = body as {
    wpPostId: number;
    title?: string;
    slug?: string;
    postStatus?: string;
    acf: Partial<WoningACF>;
  };

  if (!wpPostId || !acf || typeof acf !== "object") {
    return NextResponse.json({ error: "wpPostId en acf zijn verplicht" }, { status: 400 });
  }

  try {
    const auth = wpAuthHeader();

    const payload: Record<string, unknown> = { acf };
    if (typeof title === "string") payload.title = title;
    if (typeof slug === "string") payload.slug = slug;
    if (typeof postStatus === "string") payload.status = postStatus;

    const res = await fetch(`${WP_BASE_URL}/woning/${wpPostId}`, {
      method: "POST", // WordPress REST API gebruikt POST voor updates
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("WordPress update fout:", res.status, text);
      return NextResponse.json(
        { error: `WordPress API fout: ${res.status}` },
        { status: res.status }
      );
    }

    const updated = await res.json();

    return NextResponse.json({
      success: true,
      id: updated.id,
      acf: updated.acf,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("WP_API_USER")) {
      return NextResponse.json(
        { error: "WordPress API credentials niet geconfigureerd (WP_API_USER / WP_API_PASSWORD)" },
        { status: 503 }
      );
    }
    console.error("WordPress woning update fout:", error);
    return NextResponse.json({ error: "Kan WordPress niet bereiken" }, { status: 500 });
  }
}
