import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

const WP_BASE_URL = "https://www.devreemakelaardij.nl/wp-json/wp/v2";

function wpAuthHeader(): string {
  const user = process.env.WP_API_USER;
  const pass = process.env.WP_API_PASSWORD;
  if (!user || !pass) throw new Error("WP_API_USER of WP_API_PASSWORD ontbreekt in .env");
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

export interface WoningACF {
  woning_status?: string; // Beschikbaar, Verkocht o.v., Verkocht, Verhuurd, Onder bod
  koopsom?: string | number;
  huurprijs?: string | number;
  woonoppervlakte?: string | number;
  perceeloppervlakte?: string | number;
  kamers?: string | number;
  slaapkamers?: string | number;
  bouwjaar?: string | number;
  soort_woning?: string;
  energielabel?: string;
  adres?: string;
  postcode?: string;
  plaats?: string;
  realworks_id?: string;
  intro_tekst?: string;
  intro_tekst_ai?: string;
  woning_beschrijving?: string;
  woning_beschrijving_ai?: string;
  [key: string]: unknown;
}

export interface WoningPost {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  acf: WoningACF;
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string;
      media_details?: {
        sizes?: {
          medium_large?: { source_url: string };
          large?: { source_url: string };
        };
      };
    }>;
  };
}

/**
 * GET /api/wordpress/woning?realworksId=12345
 * Haalt woning op van WordPress op basis van Realworks ID
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const realworksId = searchParams.get("realworksId");

  if (!realworksId) {
    return NextResponse.json(
      { error: "realworksId is verplicht" },
      { status: 400 }
    );
  }

  try {
    const url = new URL(`${WP_BASE_URL}/woning`);
    url.searchParams.set("realworks_id", realworksId);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("_embed", "wp:featuredmedia");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 }, // 5 minuten cache
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `WordPress API fout: ${res.status}` },
        { status: res.status }
      );
    }

    const woningen: WoningPost[] = await res.json();

    if (!woningen || woningen.length === 0) {
      return NextResponse.json(
        { error: "Geen woning gevonden met dit Realworks ID" },
        { status: 404 }
      );
    }

    const woning = woningen[0];
    const featuredImage =
      woning._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.large
        ?.source_url ||
      woning._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes
        ?.medium_large?.source_url ||
      woning._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
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
    return NextResponse.json(
      { error: "Kan WordPress niet bereiken" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/wordpress/woning
 * Werkt ACF-velden bij op een woning in WordPress
 * Body: { wpPostId: number, acf: Partial<WoningACF> }
 *
 * Vereist WP_API_USER en WP_API_PASSWORD in .env (WordPress Application Password)
 */
export async function PATCH(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { wpPostId, acf } = body as { wpPostId: number; acf: Partial<WoningACF> };

  if (!wpPostId || !acf || typeof acf !== "object") {
    return NextResponse.json(
      { error: "wpPostId en acf zijn verplicht" },
      { status: 400 }
    );
  }

  try {
    const auth = wpAuthHeader();

    const res = await fetch(`${WP_BASE_URL}/woning/${wpPostId}`, {
      method: "POST", // WordPress REST API gebruikt POST voor updates (niet PATCH)
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ acf }),
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
    return NextResponse.json(
      { error: "Kan WordPress niet bereiken" },
      { status: 500 }
    );
  }
}
