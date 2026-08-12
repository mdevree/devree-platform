import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

const WP_BASE_URL = "https://www.devreemakelaardij.nl/wp-json/wp/v2";

function wpAuthHeader(): string {
  const user = process.env.WP_API_USER;
  const pass = process.env.WP_API_PASSWORD;
  if (!user || !pass) throw new Error("WP_API_USER of WP_API_PASSWORD ontbreekt in .env");
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

// ACF velden zoals ze daadwerkelijk terugkomen van de WordPress API
export interface WoningACF {
  realworks_id?: string;
  status?: string;           // "Beschikbaar", "Verkocht o.v.", "Verkocht", "Verhuurd", "Onder bod"
  koopsom?: number;
  koopprijs_label?: string;
  huurprijs?: number;
  koopconditie?: string;
  aanvaarding?: string;
  woonoppervlakte?: number;
  kadastrale_oppervlakte?: number;
  inhoud?: number;
  aantal_kamers?: number;
  bouwjaar?: string;
  bouwvorm?: string;
  woonhuissoort?: string;
  woonhuistype?: string;
  energieklasse?: string;
  energielabel_datum?: string;
  postcode?: string;
  plaats?: string;
  provincie?: string;
  gemeente?: string;
  wijk?: string;
  straat?: string;
  huisnummer?: string;
  coordinaten_x?: string;
  coordinaten_y?: string;
  aanbiedingstekst?: string;
  intro_tekst_ai?: string;
  woning_beschrijving_ai?: string;
  buiten_beschrijving_ai?: string;
  indeling_beschrijving_ai?: string;
  locatie_beschrijving_ai?: string;
  floorplanner_fml?: string;
  tour_360_url?: string;
  woning_video_url?: string;
  isolatievormen?: string;
  verwarming?: string;
  voorzieningen?: string;
  ligging?: string;
  [key: string]: unknown;
}

export interface WoningPost {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  realworks_id?: string;     // ook op root niveau
  acf: WoningACF;
  yoast_head_json?: {
    og_image?: Array<{ url: string; width?: number; height?: number }>;
  };
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

function sameRealworksId(value: unknown, realworksId: string) {
  return typeof value === "string" && value.trim().toLowerCase() === realworksId.trim().toLowerCase();
}

function matchesRealworksId(woning: WoningPost, realworksId: string) {
  return sameRealworksId(woning.realworks_id, realworksId) || sameRealworksId(woning.acf?.realworks_id, realworksId);
}

async function fetchWoningWithFeaturedMedia(woning: WoningPost) {
  const url = new URL(`${WP_BASE_URL}/woning/${woning.id}`);
  url.searchParams.set("_embed", "wp:featuredmedia");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) return woning;
  return await res.json() as WoningPost;
}

async function findWoningByRealworksId(realworksId: string): Promise<{ woning: WoningPost | null; errorStatus?: number }> {
  const directUrl = new URL(`${WP_BASE_URL}/woning`);
  directUrl.searchParams.set("realworks_id", realworksId);
  directUrl.searchParams.set("per_page", "1");
  directUrl.searchParams.set("_embed", "wp:featuredmedia");

  const directRes = await fetch(directUrl.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!directRes.ok) return { woning: null, errorStatus: directRes.status };

  const directWoningen: WoningPost[] = await directRes.json();
  if (directWoningen?.length) return { woning: directWoningen[0] };

  // De WordPress realworks_id filter is niet altijd betrouwbaar voor nieuwe
  // posts. Doorzoek daarom recent aanbod en match zelf op ACF realworks_id.
  for (let page = 1; page <= 5; page++) {
    const fallbackUrl = new URL(`${WP_BASE_URL}/woning`);
    fallbackUrl.searchParams.set("per_page", "100");
    fallbackUrl.searchParams.set("page", String(page));
    fallbackUrl.searchParams.set("orderby", "date");
    fallbackUrl.searchParams.set("order", "desc");
    fallbackUrl.searchParams.set("_fields", "id,slug,link,title,realworks_id,acf");

    const fallbackRes = await fetch(fallbackUrl.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!fallbackRes.ok) {
      if (fallbackRes.status === 400) break;
      return { woning: null, errorStatus: fallbackRes.status };
    }

    const woningen: WoningPost[] = await fallbackRes.json();
    const match = woningen.find((woning) => matchesRealworksId(woning, realworksId));
    if (match) return { woning: await fetchWoningWithFeaturedMedia(match) };
    if (woningen.length < 100) break;
  }

  return { woning: null };
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
