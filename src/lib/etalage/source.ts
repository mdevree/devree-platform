import { createHash } from "node:crypto";
import { findWoningByRealworksId, WP_BASE_URL } from "../wordpressWoning";
import { type Photo, type Source } from "./model";

export class EtalageError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}
type ProjectFields = {
  realworksId: string | null;
  woningAdres: string | null;
  address: string | null;
  woningPlaats: string | null;
  vraagprijs: number | null;
  aanvaarding: string | null;
  projectStatus: string | null;
};
function plain(value: unknown) {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    euro: "€",
    sup2: "²",
    eacute: "é",
    ndash: "–",
    rsquo: "’",
  };
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (s, k: string) => {
      if (!k.startsWith("#")) return entities[k] ?? s;
      const n = k[1] === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}
export function trustedImage(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.port &&
      !u.username &&
      !u.password &&
      ["www.devreemakelaardij.nl", "devreemakelaardij.nl"].includes(
        u.hostname,
      ) &&
      u.pathname.startsWith("/wp-content/uploads/")
    );
  } catch {
    return false;
  }
}
type Attachment = {
  id: number;
  source_url: string;
  mime_type: string;
  alt_text?: string;
  title?: { rendered: string };
  modified_gmt?: string;
  media_details?: {
    width?: number;
    height?: number;
    original_image?: string;
    sizes?: { thumbnail?: { source_url: string } };
  };
};
const fields =
  "id,source_url,media_details,alt_text,title,mime_type,modified_gmt";
async function mediaRequest(url: URL) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new EtalageError(
      "De fotogalerij kon niet worden opgehaald. Probeer het opnieuw.",
      502,
    );
  return response;
}
async function gallery(wpId: number, featured?: number) {
  const media: Attachment[] = [];
  let page = 1,
    pages = 1;
  do {
    const url = new URL(WP_BASE_URL + "/media");
    url.search = new URLSearchParams({
      parent: String(wpId),
      page: String(page),
      per_page: "100",
      orderby: "id",
      order: "asc",
      media_type: "image",
      _fields: fields,
    }).toString();
    const res = await mediaRequest(url);
    media.push(...((await res.json()) as Attachment[]));
    pages = Number(res.headers.get("x-wp-totalpages") || 1);
  } while (++page <= pages);
  if (featured && !media.some((m) => m.id === featured)) {
    const res = await mediaRequest(
      new URL(WP_BASE_URL + "/media/" + featured + "?_fields=" + fields),
    );
    media.unshift((await res.json()) as Attachment);
  }
  const photos: Photo[] = [];
  const hash = createHash("sha256");
  for (const m of media) {
    const d = m.media_details;
    if (
      !d?.width ||
      !d.height ||
      !["image/jpeg", "image/png", "image/webp"].includes(m.mime_type) ||
      !trustedImage(m.source_url)
    )
      continue;
    const url = d.original_image
      ? new URL(encodeURIComponent(d.original_image), m.source_url).href
      : m.source_url;
    const thumb = d.sizes?.thumbnail?.source_url;
    const photo = {
      id: m.id,
      url,
      thumb: thumb && trustedImage(thumb) ? thumb : m.source_url,
      width: d.width,
      height: d.height,
      label: plain(m.alt_text || m.title?.rendered) || "Woningfoto " + m.id,
    };
    photos.push(photo);
    hash.update(JSON.stringify([photo, m.modified_gmt]));
  }
  return { photos, mediaKey: hash.digest("hex") };
}
export async function listing(project: ProjectFields) {
  const code = project.realworksId?.trim() || "";
  const { woning, errorStatus } = code
    ? await findWoningByRealworksId(code)
    : { woning: null, errorStatus: undefined };
  if (errorStatus)
    throw new EtalageError(
      "De woningwebsite is tijdelijk niet bereikbaar.",
      502,
    );
  const { photos, mediaKey } = woning
    ? await gallery(woning.id, woning.featured_media)
    : { photos: [], mediaKey: "" };
  const a = woning?.acf ?? {};
  const websitePrice = Number(a.koopsom);
  const address =
    a.straat && a.huisnummer
      ? [a.straat, a.huisnummer, a.huisnummertoevoeging]
          .filter(Boolean)
          .join(" ")
      : "";
  const rawCondition = plain(a.koopconditie);
  const condition = /^kosten koper$/i.test(rawCondition)
    ? "k.k."
    : /^vrij op naam$/i.test(rawCondition)
      ? "v.o.n."
      : rawCondition;
  const source: Source = {
    code,
    street: plain(address || project.woningAdres || project.address),
    city: plain(a.plaats || project.woningPlaats),
    websitePrice:
      Number.isSafeInteger(websitePrice) && websitePrice > 0
        ? websitePrice
        : null,
    projectPrice: project.vraagprijs || null,
    priceLabel: plain(a.koopprijs_label) || "Vraagprijs",
    condition,
    status: plain(a.status || project.projectStatus),
    delivery: plain(a.aanvaarding || project.aanvaarding),
    description: plain(a.aanbiedingstekst),
    mediaKey,
  };
  return { source, photos, hero: woning?.featured_media };
}
