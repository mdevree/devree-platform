export const WP_BASE_URL = "https://www.devreemakelaardij.nl/wp-json/wp/v2";

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
  featured_media?: number;
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

export async function findWoningByRealworksId(realworksId: string): Promise<{ woning: WoningPost | null; errorStatus?: number }> {
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
  const directMatch = directWoningen?.find(woning => matchesRealworksId(woning, realworksId));
  if (directMatch) return { woning: directMatch };

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
    if (match) {
      const full = await fetchWoningWithFeaturedMedia(match);
      if (matchesRealworksId(full, realworksId)) return { woning: full };
    }
    if (woningen.length < 100) break;
  }

  return { woning: null };
}
