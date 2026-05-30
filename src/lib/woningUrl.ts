/**
 * Normaliseer een website-URL naar een woning-identiteit.
 *
 * Mautic levert page.hit-events met de bezochte URL (MauticEvent.clickedUrl).
 * Woningpagina's op devreemakelaardij.nl hebben de vorm:
 *   https://www.devreemakelaardij.nl/woning/<slug>/?utm=...
 * We extraheren de slug zodat herhaalde bezoeken aan dezelfde woning te tellen zijn.
 */

export interface WoningHit {
  slug: string;
  url: string;
}

const WONING_PAD = /\/woning\/([^/?#]+)/i;

/**
 * Geeft de woning-slug terug als de URL een woningpagina is, anders null.
 */
export function woningSlugVanUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let pad = url;
  try {
    pad = new URL(url).pathname;
  } catch {
    // Geen absolute URL — val terug op de ruwe string.
  }
  const match = pad.match(WONING_PAD);
  if (!match) return null;
  const slug = match[1].trim().toLowerCase();
  return slug.length > 0 ? slug : null;
}

/**
 * Is deze URL een woningpagina?
 */
export function isWoningUrl(url: string | null | undefined): boolean {
  return woningSlugVanUrl(url) !== null;
}
