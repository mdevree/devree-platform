import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normal, mentionsAddress, pageHash } from "./whatsappResourceLinks";
import type { Home } from "./whatsappRecommendationContext";

export type MarketSearch = { cities: string[]; maxPrice: number | null; minPrice: number | null;
  bedrooms: number | null; kind: "Woonhuis" | "Appartement" | null; keywords: string[] };
type Known = { words: string; history: string; hashes: Set<string>; knownIds: Set<string>; ownAddresses: Set<string>;
  referencePrice?: number; budgets: { priceMin: number | null; priceMax: number | null }[] };

export function parseMarketSearch(value: unknown): MarketSearch {
  const q = value as MarketSearch;
  if (!q || !Array.isArray(q.cities) || !q.cities.length || q.cities.length > 8 ||
      !Array.isArray(q.keywords) || q.keywords.length > 12 ||
      [...q.cities, ...q.keywords].some(w => typeof w !== "string" || !w.trim() || w.length > 90) ||
      ![null,"Appartement","Woonhuis"].includes(q.kind) ||
      [q.minPrice,q.maxPrice,q.bedrooms].some(n => n !== null && (!Number.isSafeInteger(n) || n <= 0 || n > 2_000_000_000)) ||
      (q.minPrice && q.maxPrice && q.minPrice > q.maxPrice)) throw Error("Ongeldige marktzoekvraag");
  return q;
}

function titleOf(a: {street: string | null; houseNumber: string | null; houseNumberAddition: string | null}) {
  return a.street && a.houseNumber ? `${a.street} ${a.houseNumber}${a.houseNumberAddition || ""}` : "";
}
function addressMatches(words: string, row: Parameters<typeof titleOf>[0]) {
  return mentionsAddress(words,titleOf(row)) || (!!row.houseNumberAddition &&
    mentionsAddress(words,`${row.street} ${row.houseNumber} ${row.houseNumberAddition}`));
}

export async function sentMarketHashes(tx: Prisma.TransactionClient, body: string) {
  const numbers = [...new Set(Array.from(body.matchAll(/\b(\d{1,5})(?=[a-z]?\b|[-/])/gi), m => m[1]))];
  if (!numbers.length) return [];
  const words = " " + normal(body) + " ";
  const addresses = await tx.marketObject.findMany({ where: { houseNumber: { in: numbers }, canonicalKey:{not:null} },
    select:{ street:true, houseNumber:true, houseNumberAddition:true, canonicalKey:true } });
  return addresses.filter(a=>addressMatches(words,a)).map(a=>pageHash("market:"+a.canonicalKey));
}

export async function marketHomes(query: MarketSearch, known: Known): Promise<Home[]> {
  const q = parseMarketSearch(query);
  const enrichedSince = new Date(Date.now() - 30 * 86_400_000);
  const recentDetails = { source: "move", status: "success", enrichedAt: { gte: enrichedSince } };
  const candidates = await prisma.marketObject.findMany({
    where: { status:"active", closedAt:null, transactionPrice:null, canonicalKey:{not:null},
      city:{in:q.cities}, objectKind:q.kind || {in:["Woonhuis","Appartement"]},
      askingPrice:{gte:q.minPrice || 1, ...(q.maxPrice ? {lte:q.maxPrice} : {})},
      ...(q.bedrooms ? { bedrooms:{gte:q.bedrooms} } : {}),
      sources:{some:{source:"realworks"}}, enrichments:{some:recentDetails} },
    select:{street:true,houseNumber:true,houseNumberAddition:true,canonicalKey:true,city:true,bedrooms:true,askingPrice:true,
      brokerName:true,lastMutationAt:true,sources:{where:{source:"realworks"},select:{sourceObjectId:true,sourceUrl:true,rawPayload:true}},
      enrichments:{where:recentDetails,select:{features:true,listingText:true}}}, orderBy:{ lastMutationAt:"desc" },
  });
  const matches = candidates.flatMap(c => {
    const title = titleOf(c), info = c.enrichments[0], price = c.askingPrice;
    const broker = c.brokerName?.split(/\r?\n/)[0].trim();
    if (!title || !price || !broker || !c.city || /de\s*vree/i.test(broker) ||
        known.ownAddresses.has(normal(title+" "+c.city)) || known.hashes.has(pageHash("market:"+c.canonicalKey)) || addressMatches(known.words,c) ||
        c.sources.some(s=>known.knownIds.has(s.sourceObjectId || "") || (s.sourceUrl && known.history.includes(s.sourceUrl.toLowerCase()))) ||
        !c.sources.some(s=>["new","price_changed"].includes(String((s.rawPayload as {mutationType?:string})?.mutationType)))) return [];
    if (known.budgets.length && !known.budgets.some(b=>(!b.priceMin || price>=b.priceMin) && (!b.priceMax || price<=b.priceMax))) return [];
    const features = (info?.features as {kenmerken?: {label:string;value:string}[]})?.kenmerken;
    if (!Array.isArray(features)) return [];
    const statuses = features.filter(f=>f.label?.toLowerCase()==="status");
    if (!statuses.length || statuses.some(f=>! /^(beschikbaar|available|te koop)$/i.test(f.value.trim()))) return [];
    const text = (info.listingText || "").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
    const details = features.filter(f=>/slaapkamer|parkeren|parkeerfaciliteit|onderhoud|woonoppervlak|energielabel|tuin|bedroom|parking/i.test(f.label))
      .map(f=>f.label+": "+f.value).join(". ");
    const keywords = q.keywords.map(normal);
    const score = (s:string)=>keywords.filter(k=>normal(s).includes(k)).length;
    const excerpts = text.split(/(?<=[.!?])\s+/).filter(s=>score(s)>0).sort((a,b)=>score(b)-score(a)).slice(0,3);
    const description = [c.bedrooms !== null ? c.bedrooms+" slaapkamers" : "",details,...excerpts].filter(Boolean).join(". ").slice(0,1300);
    // Exchange links in the mutation email are intended for the broker. Only pass public listing URLs through.
    const url = c.sources.map(s=>s.sourceUrl || "").find(u=>/^https:\/\/(?:www\.)?funda\.nl\/detail\/koop\/[a-z0-9-]+\/[a-z0-9-]+\/\d+\/?$/i.test(u)) || "";
    return [{home:{ title,city:c.city,price,broker,description,url },score:score(description),
      distance:known.referencePrice ? Math.abs(price-known.referencePrice) : 0}];
  });
  return matches.sort((a,b)=>b.score-a.score || a.distance-b.distance).slice(0,12).map(m=>m.home);
}
