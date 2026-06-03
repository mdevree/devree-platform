/**
 * Gedeelde WordPress-woninghelper. Haalt woning-content (ACF-velden, foto, link)
 * op uit de publieke WordPress REST API op basis van het Realworks-ID.
 *
 * Gebruikt o.a. door /api/agenda/[id]/context en /api/projecten/[id]/bezichtigingen.
 */

const WP_BASE_URL = "https://www.devreemakelaardij.nl/wp-json/wp/v2";

export interface WoningVanWordPress {
  wpId: number;
  slug: string;
  link: string;
  titel: string | null;
  featuredImage: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  acf: Record<string, any>;
}

export async function fetchWoningVanWordPress(
  realworksId: string
): Promise<WoningVanWordPress | null> {
  try {
    const url = new URL(`${WP_BASE_URL}/woning`);
    url.searchParams.set("realworks_id", realworksId);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("_embed", "wp:featuredmedia");
    // next.revalidate is een Next.js-uitbreiding op fetch, niet in standaard RequestInit
    const fetchOptions = { headers: { Accept: "application/json" }, next: { revalidate: 300 } };
    const res = await fetch(url.toString(), fetchOptions as RequestInit);
    if (!res.ok) return null;
    const woningen = await res.json();
    if (!woningen?.length) return null;
    const w = woningen[0];
    const featuredImage =
      w._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.large?.source_url ||
      w._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.medium_large?.source_url ||
      w._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
      w.yoast_head_json?.og_image?.[0]?.url ||
      null;
    return {
      wpId: w.id,
      slug: w.slug,
      link: w.link,
      titel: w.title?.rendered ?? null,
      featuredImage,
      acf: w.acf ?? {},
    };
  } catch {
    return null;
  }
}
