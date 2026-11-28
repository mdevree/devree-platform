import type { WaReplyDraft } from "@prisma/client";
import { prisma } from "./prisma";
import { getContactFull, getMauticNotesPage, verifyViewingRelation, visitedContactPages } from "./mautic";
import { WP_BASE_URL, type WoningPost } from "./wordpressWoning";
import { marketHomes, type MarketSearch } from "./whatsappMarketHomes";
import { officePage, pageHash, normal, mentionsAddress } from "./whatsappResourceLinks";

type Page = { title: string; url: string; information?: string };
export type Home = Page & { city: string; price: number; description: string; broker?: string };
export type ReplyResources = {
  findMarket?: (query: MarketSearch) => Promise<Home[]>;
  pages: Page[]; homes: Home[]; reference?: { title: string; price: number; city: string };
  locations?: string[]; preferences?: string[]; budgets?: { priceMin: number | null; priceMax: number | null }[];
};
type Draft = Pick<WaReplyDraft, "mauticContactId" | "conversationId">;

function clean(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

async function wpCollection<T>(type: string, fields: string) {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ per_page: "100", page: String(page), _fields: fields });
    const res = await fetch(`${WP_BASE_URL}/${type}?${query}`, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw Error("Websitecatalogus niet beschikbaar");
    const items: T[] = await res.json();
    result.push(...items);
    if (items.length < 100 || page >= Number(res.headers.get("X-WP-TotalPages") || Infinity)) return result;
  }
}

type Index = { homes: (Home & { code: string; status: string })[]; pages: Page[] };
async function publicIndex(): Promise<Index> {
  const [posts, catalog, pages, faqs] = await Promise.all([
    wpCollection<WoningPost>("woning", "link,acf.plaats,acf.straat,acf.huisnummer,acf.koopsom,acf.status,acf.realworks_id,acf.aanbiedingstekst"),
    prisma.aiLinkCatalogItem.findMany({ where: { active: true, type: "dienst" }, select: { title: true, url: true } }),
    wpCollection<{ title: { rendered: string }; link: string }>("pages", "title,link"),
    wpCollection<{ title: { rendered: string }; link: string; yoast_head_json?: { description?: string } }>("faq", "title,link,yoast_head_json.description"),
  ]);
  const homes = posts.flatMap(w => {
    const a = w.acf, url = officePage(w.link);
    if (!a?.straat || !a.huisnummer || !Number(a.koopsom) || !url) return [];
    return [{ title: `${a.straat.trim()} ${a.huisnummer}`, city: clean(a.plaats), price: Number(a.koopsom),
      description: clean(a.aanbiedingstekst), status: clean(a.status).toLowerCase(), code: clean(a.realworks_id), url }];
  });
  const publicPages = pages.filter(p => !/bedankt|checkout|inloggen|dashboard|bevestiging|betaal|akkoord|voorwaarden|privacy|mijn-|formulier/i.test(p.link))
    .map(p => ({ title: p.title.rendered, url: p.link }));
  return { homes, pages: [...new Map([...catalog, ...publicPages, ...faqs.map(f => ({ title: f.title.rendered, url: f.link, information: clean(f.yoast_head_json?.description).slice(0,300) }))].flatMap(p => {
    const url = officePage(p.url);
    return url ? [[url, { title: clean(p.title), url, ...("information" in p && typeof p.information === "string" ? { information: p.information } : {}) }] as const] : [];
  })).values()] };
}

let cache: { until: number; result: Promise<Index> } | undefined;
function index() {
  if (!cache || cache.until < Date.now()) {
    const result = publicIndex().catch(e => { cache = undefined; throw e; });
    cache = { until: Date.now() + 300_000, result };
  }
  return cache.result;
}

async function notesFor(contact: number) {
  const texts: string[] = [];
  let start = 0;
  for (;;) {
    const page = await getMauticNotesPage(contact, start);
    texts.push(...page.notes.map(n => n.text));
    if (page.nextStart === null) return texts;
    if (page.nextStart <= start || texts.length > 2000) throw Error("Onvolledige contacthistorie");
    start = page.nextStart;
  }
}

async function knownResources(draft: Draft) {
  const id = draft.mauticContactId;
  if (!id) return null;
  const crm = await getContactFull(id, AbortSignal.timeout(5000));
  if (!crm || crm.id !== id) return null;
  const code = crm.realworksCode, systemId = crm.realworksSystemId;
  if (code || systemId) await verifyViewingRelation(code, systemId, id);
  const [agenda, messages, followups, events, searchers, notes, receipts, visits] = await Promise.all([
    prisma.agendaAfspraak.findMany({ where: { OR: [{ mauticContactId: id },
      ...(code ? [{ mauticContactId: null, agrcode: code }] : []),
      ...(systemId ? [{ mauticContactId: null, relationRelationid: systemId }] : [])] }, select: { agdescr: true, aglocation: true } }),
    prisma.waMessage.findMany({ where: { OR: [{ conversation: { mauticContactId: id } },
      ...(draft.conversationId ? [{ conversationId: draft.conversationId }] : [])],
      AND: [{ OR: [{ deliveryStatus: null }, { deliveryStatus: { not: "FAILED" } }] }] }, select: { body: true } }),
    prisma.followUpDraft.findMany({ where: { mauticContactId: id, sentAt: { not: null } }, select: { body: true, links: true } }),
    prisma.mauticEvent.findMany({ where: { mauticContactId: id }, select: { clickedUrl: true, emailName: true } }),
    prisma.realworksSearcher.findMany({ where: { OR: [{ mauticContactId: id },
      ...(systemId ? [{ mauticContactId: null, relationSystemId: systemId }] : [])] },
      select: { searcherId: true, status: true, priceMin: true, priceMax: true, locations: true } }),
    notesFor(id), prisma.waSharedPage.findMany({ where: { contactId: id }, select: { pageHash: true } }), visitedContactPages(id),
  ]);
  const results = await prisma.realworksSearchResult.findMany({ where: { searcherId: { in: searchers.map(s => s.searcherId) },
    OR: [{ searchResultStatus: { in: ["SENT", "DELETED"] } }, { dateSent: { not: null } }, { dateViewed: { not: null } }, { dateContactFormClicked: { not: null } }, { isLiked: true }] },
    select: { exchangeObjectId: true, objectAddress: true, objectUrl: true } });
  const history = [...visits, ...notes, ...messages.map(m => m.body), ...agenda.flatMap(a => [a.agdescr, a.aglocation]),
    ...followups.flatMap(d => [d.body, JSON.stringify(d.links)]), ...events.flatMap(e => [e.clickedUrl, e.emailName]),
    ...results.flatMap(r => [r.objectAddress, r.objectUrl])].filter(Boolean).join("\n");
  const profile = JSON.parse(crm.zoekerData || "{}");
  const preferences = Array.isArray(profile?.activePersonalPreferences)
    ? profile.activePersonalPreferences.flatMap((p: {label?:string; polarity?:string}) =>
        typeof p?.label === "string" ? [(p.polarity === "avoid" ? "Vermijden: " : "") + p.label.slice(0,150)] : []).slice(0,15) : [];
  const locations = searchers.filter(s => s.status === "LOPEND").flatMap(s => {
    const edges = (s.locations as { edges?: {displayName?: string}[] } | null)?.edges;
    return Array.isArray(edges) ? edges.flatMap(e => e.displayName?.split(",")[0] || []) : [];
  });
  return { history, preferences, locations, knownIds: new Set(results.map(r => r.exchangeObjectId)), hashes: new Set(receipts.map(r => r.pageHash)),
    budgets: searchers.filter(s => s.status === "LOPEND" && (s.priceMin || s.priceMax)).map(s => ({ priceMin:s.priceMin, priceMax:s.priceMax })) };
}

export async function replyResources(draft: Draft, messages: string[], previous?: string): Promise<ReplyResources> {
  const catalog = await index();
  const known = await knownResources(draft).catch(() => {
    console.warn("WhatsApp-woninghistorie onvolledig, woningvoorstellen overgeslagen");
    return null;
  });
  const inbound = messages.join("\n");
  const history = [known?.history, inbound, previous].filter(Boolean).join("\n").toLowerCase();
  const words = ` ${normal(history)} `;
  const seen = (url: string) => known?.hashes.has(pageHash(url)) || history.includes(new URL(url).pathname.replace(/\/$/, "").toLowerCase() + "/")
    || history.includes(url.replace(/\/$/, "").toLowerCase());
  const questions = new Set(normal(inbound).split(" ").filter(w => w.length > 3 && !/^(deze|voor|over|zijn|wordt|worden|jullie|onze|gaat|huis|woning|hebben|moeten|willen|welke|waar|graag|eigen|informatie|meer|staat|komt)$/.test(w)));
  const score = (page: Page) => [...questions].filter(w => normal(page.title+" "+new URL(page.url).pathname).includes(w)).length;
  const asksForLink = /\b(link(?:je)?|url|webadres|woningpagina)\b/i.test(inbound) && /[?]|\b(stuur|sturen|delen|send|share|opnieuw|nogmaals|again)\b/i.test(inbound);
  const pages = catalog.pages.filter(p => !seen(p.url) || (asksForLink && score(p) > 0)).map(p => ({ p, score: score(p) }))
    .sort((a,b) => b.score-a.score).slice(0,24).map(x => x.p);
  if (!known) return { pages, homes: [] };
  const projects = await prisma.project.findMany({ where: { type: "VERKOOP", projectStatus: { in: ["ACTIEF", "LIVE_FUNDA"] },
    realworksId: { not: null } }, select: { realworksId: true } });
  const active = new Set(projects.map(p => p.realworksId));
  const agreements = await prisma.agendaAfspraak.findMany({
    where: { agobjcode: { in: [...active].filter((code): code is string => !!code) },
      AND: [{ OR: [{ aginactive: null }, { aginactive: false }] },
        { OR: [{ agdescr: { contains: "koopovereenkomst" } }, { agtype: { contains: "transport" } },
          { agtype: { contains: "tekenen koper" } }, { agtype: { contains: "tekenen verkoper" } }] }] },
    select: { agobjcode: true },
  });
  for (const appointment of agreements) active.delete(appointment.agobjcode);
  const discussion = ` ${normal([inbound, previous].filter(Boolean).join(" "))} `;
  const reference = catalog.homes.find(h => mentionsAddress(discussion, h.title));
  const homes = catalog.homes.filter(h => h.status === "beschikbaar" && active.has(h.code) &&
    ((!seen(h.url) && !mentionsAddress(words,h.title)) || (asksForLink && mentionsAddress(" "+normal(inbound)+" ",h.title))) &&
    (!known.budgets.length || known.budgets.some(b => (!b.priceMin || h.price >= b.priceMin) && (!b.priceMax || h.price <= b.priceMax))))
    .sort((a,b) => reference ? Math.abs(a.price-reference.price)-Math.abs(b.price-reference.price) : a.price-b.price)
    .slice(0,12).map(({title,city,price,url,description}) => {
      const facts = description.split(/(?<=[.!?])\s+|\s+-\s+/).filter(s => /slaapkamer|keuken|parkeren|parkeerplaats|oprit|moderniser|renover|instapklaar/i.test(s));
      return { title,city,price,url,description: facts.join(" ").slice(0,1400) };
    });
  const ownAddresses = new Set(catalog.homes.filter(h => active.has(h.code)).map(h => normal(h.title + " " + h.city)));
  const searchArea = " " + normal([inbound, previous, reference?.city, ...known.locations, ...known.preferences].filter(Boolean).join(" ")) + " ";
  const findMarket = (query: MarketSearch) => {
    const cities = query.cities.filter(city => mentionsAddress(searchArea, city));
    if (!cities.length) return Promise.resolve([]);
    return marketHomes({ ...query, cities }, { words, history, ownAddresses, hashes: known.hashes,
      knownIds: known.knownIds, referencePrice: reference?.price, budgets: known.budgets });
  };
  return { pages, homes, findMarket, locations: known.locations, budgets:known.budgets, preferences:known.preferences, ...(reference ? { reference:{title:reference.title,price:reference.price,city:reference.city} } : {}) };
}

export { normal, mentionsAddress } from "./whatsappResourceLinks";
