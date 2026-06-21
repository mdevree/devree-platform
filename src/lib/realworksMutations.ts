const SECTION_TYPES: Record<string, string> = {
  "Nieuwe Objecten": "new",
  "Afgemelde Objecten": "removed",
  Prijswijzigingen: "price_changed",
  "Ingetrokken Objecten": "withdrawn",
};

export type ParsedRealworksMutation = {
  mutationType: string;
  mutationLabel: string;
  mutationDate: string | null;
  exchangeObjectId: string;
  moveUrl: string;
  addressRaw: string | null;
  street: string | null;
  houseNumber: string | null;
  postcode: string | null;
  city: string | null;
  objectKind: string | null;
  objectSubType: string | null;
  askingPrice: number | null;
  transactionPrice: number | null;
  rooms: number | null;
  bedrooms: number | null;
  livingArea: number | null;
  plotArea: number | null;
  buildYear: number | null;
  brokerName: string | null;
  brokerEmail: string | null;
  imageUrl: string | null;
  features: Record<string, unknown>;
  rawText: string;
  rawHtml: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&#8364;/g, "€")
    .replace(/&sup2;/g, "²")
    .replace(/&sup3;/g, "³");
}

function htmlToText(value: string): string {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th|tr|p|div|table|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function inlineText(value: string): string {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

function parseDutchDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`;
}

function parseEuro(value: string): number | null {
  const match = value.match(/€\s*([0-9.\s]+),\d{2}/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1].replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberBefore(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  const parsed = Number.parseInt(match[1].replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeExchangeObjectId(moveUrl: string): string | null {
  const match = moveUrl.match(/move\.nl\/exchange-object\/([^/]+)\/overzicht/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8");
    return decoded.match(/^ExchangeObject:([^|]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function lastSectionBefore(html: string, index: number): string | null {
  const prefix = html.slice(0, index);
  let best: { section: string; index: number } | null = null;
  for (const section of Object.keys(SECTION_TYPES)) {
    const sectionIndex = prefix.lastIndexOf(section);
    if (sectionIndex !== -1 && (!best || sectionIndex > best.index)) {
      best = { section, index: sectionIndex };
    }
  }
  return best?.section ?? null;
}

function objectBlockAround(html: string, index: number, nextIndex: number | null): string {
  const start = Math.max(html.lastIndexOf('<div style="page-break-inside:avoid"', index), 0);
  const boundedEnd = nextIndex ? html.lastIndexOf('<div style="page-break-inside:avoid"', nextIndex) : -1;
  const end = boundedEnd > start ? boundedEnd : html.indexOf("<!-- DOE EEN PAGE BREAK!", index);
  return html.slice(start, end > start ? end : undefined);
}

function parseAddress(raw: string | null) {
  if (!raw) {
    return { city: null, street: null, houseNumber: null, postcode: null };
  }
  const city = raw.split(",")[0]?.trim() || null;
  const postcode = raw.match(/\b[1-9][0-9]{3}\s?[A-Z]{2}\b/i)?.[0]?.toUpperCase() ?? null;
  const afterComma = raw.includes(",") ? raw.split(",").slice(1).join(",") : raw;
  const beforePostcode = postcode ? afterComma.split(postcode)[0] : afterComma;
  const streetPart = beforePostcode.replace(/\s+,?\s*$/, "").trim();
  const houseMatch = streetPart.match(/^(.*?)(\d+[A-Za-z0-9\-\/ ]*)$/);
  return {
    city,
    street: houseMatch?.[1]?.trim().replace(/,$/, "") || streetPart || null,
    houseNumber: houseMatch?.[2]?.trim() || null,
    postcode,
  };
}

export function parseRealworksMutationEmailHtml(html: string): ParsedRealworksMutation[] {
  const linkRegex = /https:\/\/move\.nl\/exchange-object\/[^"' <]+\/overzicht/g;
  const links = Array.from(html.matchAll(linkRegex));
  const mutations: ParsedRealworksMutation[] = [];

  for (let i = 0; i < links.length; i += 1) {
    const moveUrl = links[i][0];
    const exchangeObjectId = decodeExchangeObjectId(moveUrl);
    const index = links[i].index ?? 0;
    const section = lastSectionBefore(html, index);
    if (!exchangeObjectId || !section) continue;

    const block = objectBlockAround(html, index, links[i + 1]?.index ?? null);
    const rawText = htmlToText(block);
    const addressRaw =
      inlineText(block.match(/<a[^>]+move\.nl\/exchange-object\/[^>]+>[\s\S]*?<b>([\s\S]*?)<\/b>/i)?.[1] ?? "") || null;
    const address = parseAddress(addressRaw);
    const mutationLabel =
      rawText.match(/(Aangemeld per \d{2}-\d{2}-\d{4}|Verkocht \/ Verhuurd per \d{2}-\d{2}-\d{4}|Ingetrokken per \d{2}-\d{2}-\d{4}|Prijswijziging)/)?.[1] ??
      section;
    const typeMatch = block.match(/<td[^>]*>\s*<b>([^<]+)<\/b>\s*(?:\(([^)]+)\))?/i);
    const brokerEmail = htmlToText(block.match(/mailto:([^"'>\s]+)/i)?.[1] ?? "") || null;
    const brokerLine = htmlToText(block.match(/<div style="font-size:10px;"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
    const imageUrl = decodeHtml(block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "") || null;
    const askingPart = rawText.match(/Vraagprijs\s+€\s*[0-9.\s]+,\d{2}/)?.[0] ?? "";
    const transactionPart = rawText.match(/Transactieprijs\s+€?\s*€\s*[0-9.\s]+,\d{2}/)?.[0] ?? "";

    mutations.push({
      mutationType: SECTION_TYPES[section],
      mutationLabel,
      mutationDate: parseDutchDate(mutationLabel),
      exchangeObjectId,
      moveUrl,
      addressRaw,
      ...address,
      objectKind: typeMatch?.[1]?.trim() ?? null,
      objectSubType: typeMatch?.[2]?.trim() ?? null,
      askingPrice: parseEuro(askingPart),
      transactionPrice: parseEuro(transactionPart),
      rooms: parseNumberBefore(rawText, /(\d+)\s+kamer\(s\)/i),
      bedrooms: parseNumberBefore(rawText, /waarvan\s+(\d+)\s+slaapkamer/i),
      livingArea: parseNumberBefore(rawText, /(\d+)\s*m²\s+gebruiksopp\. woonfunctie/i),
      plotArea: parseNumberBefore(rawText, /(\d+)\s*m²\s+perceel oppervlak/i),
      buildYear: parseNumberBefore(rawText, /Bouwjaar\s+(\d{4})/i),
      brokerName: brokerLine.split(" - Telefoon ")[0]?.trim() || null,
      brokerEmail,
      imageUrl,
      features: { sourceSection: section },
      rawText,
      rawHtml: block,
    });
  }

  return mutations;
}
