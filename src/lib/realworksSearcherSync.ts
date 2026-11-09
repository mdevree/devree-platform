import { prisma } from "./prisma";
import { findUniqueRealworksContact, getContactFull, updateContact } from "./mautic";
import { normalizeSearcher, normalizeResult, jsonValue } from "./realworksSearcherNormalization";

export function mergeSearcher(previous: unknown, incoming: unknown): Record<string, unknown> {
  const old = (previous || {}) as Record<string, unknown>;
  const wrapper = (incoming || {}) as Record<string, unknown>;
  const next = (wrapper.node || wrapper) as Record<string, unknown>;
  const merged = { ...old, ...next };
  if (Array.isArray(next.clients) && Array.isArray(old.clients)) {
    const previousClients = old.clients;
    merged.clients = next.clients.map(client => ({
      ...previousClients.find((c: Record<string, unknown>) => c.id === client.id), ...client,
    }));
  }
  return merged;
}

async function syncProfile(contactId: number) {
  const contact = await getContactFull(contactId);
  if (!contact) throw new Error("Mautic profile unavailable");
  const searchers = await prisma.realworksSearcher.findMany({where: {mauticContactId: contactId}, orderBy: {searcherId: "asc"}});
  const profiles = [];
  for (const s of searchers) {
    const results = await prisma.realworksSearchResult.findMany({
      where: {searcherId: s.searcherId}, orderBy: {exchangeObjectId: "asc"},
      select: {exchangeObjectId:true, objectAddress:true, objectCity:true, objectPrice:true, searchResultStatus:true,
        matchingPercentage:true, dateFound:true, dateSent:true, dateViewed:true, dateContactFormClicked:true, isLiked:true},
    });
    profiles.push({searcherId:s.searcherId, status:s.status, type:s.type, budget:{min:s.priceMin,max:s.priceMax},
      locations:s.locations, criteria:s.criteria, notes:s.notes, sourceDetails:s.raw, results});
  }
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(contact.zoekerData || "{}"); } catch { existing = {previousText:contact.zoekerData}; }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) existing = {previousValue:existing};
  const summary = profiles.map(s => {
    const raw = s.sourceDetails as Record<string, unknown> | null;
    const properties = raw?.properties as Record<string, unknown> | undefined;
    const locations = s.locations as {edges?: Array<{displayName?: string}>} | null;
    return [`Zoekopdracht ${s.searcherId}: ${s.status}`, locations?.edges?.map(l=>l.displayName).filter(Boolean).join(", "),
      `Budget: ${s.budget.min ?? "niet ingevuld"} - ${s.budget.max ?? "niet ingevuld"}`,
      properties?.numOfBedroomsFrom ? `Vanaf ${properties.numOfBedroomsFrom} slaapkamers` : null,
      `${s.results.filter(r=>r.dateSent).length} verzonden woningen; ${s.results.filter(r=>r.dateViewed).length} bekeken; ${s.results.filter(r=>r.isLiked===true).length} geliket`,
      s.notes].filter(Boolean).join("; ");
  }).join("\n");
  const realworks = {source:"Realworks", summary, searchers: profiles};
  if (JSON.stringify(existing.realworks) === JSON.stringify(realworks)) return;
  const updated = await updateContact(contactId, {zoeker_data:JSON.stringify({...existing,realworks}),
    contact_type_zoeker:searchers.some(s=>["LOPEND","WACHT","ACTIVE","WAITING"].includes(s.status || "")) ? 1 : 0});
  if (!updated) throw new Error("Mautic search profile update failed");
}

export async function ingestSearchers(payload: {searchers?: unknown[]; results?: unknown[]}) {
  const contactIds = new Set<number>();
  const resultSearcherIds = new Set<string>();
  let searchers = 0, results = 0;
  for (const item of payload.searchers || []) {
    const first = normalizeSearcher(item);
    if (!first.searcherId) throw new Error("Missing searcher ID");
    const existing = await prisma.realworksSearcher.findUnique({where:{searcherId:first.searcherId}});
    const s = normalizeSearcher(mergeSearcher(existing?.raw, item));
    const contactId = await findUniqueRealworksContact(s.relationSystemId, s.clientEmail);
    const data = {...s, searcherId:first.searcherId, mauticContactId:contactId,
      locations:jsonValue(s.locations), criteria:jsonValue(s.raw), raw:jsonValue(s.raw),lastSyncedAt:new Date()};
    await prisma.realworksSearcher.upsert({where:{searcherId:first.searcherId},create:data,update:data});
    if(contactId) contactIds.add(contactId);
    searchers++;
  }
  for (const item of payload.results || []) {
    const r = normalizeResult(item);
    if (!r.searcherId || !r.exchangeObjectId) throw new Error("Missing search result identity");
    const data = {...r,searcherId:r.searcherId,exchangeObjectId:r.exchangeObjectId,
      matchedCriteria:jsonValue(r.matchedCriteria),nonMatchedCriteria:jsonValue(r.nonMatchedCriteria),raw:jsonValue(r.raw),lastSyncedAt:new Date()};
    await prisma.realworksSearchResult.upsert({where:{searcherId_exchangeObjectId:{searcherId:r.searcherId,exchangeObjectId:r.exchangeObjectId}},create:data,update:data});
    resultSearcherIds.add(r.searcherId);results++;
  }
  if(resultSearcherIds.size) {
    const linked = await prisma.realworksSearcher.findMany({where:{searcherId:{in:[...resultSearcherIds]}},select:{mauticContactId:true}});
    linked.forEach(s=>{if(s.mauticContactId)contactIds.add(s.mauticContactId);});
  }
  for(const contactId of contactIds) await syncProfile(contactId);
  return {searchers,results,profiles:contactIds.size};
}

// Serialize browser batches; unlike discovery captures this path does not archive
// entire network responses or recalculate every opportunity after every request.
let pending: Promise<unknown> = Promise.resolve();
export function queueSearcherIngest(payload: Parameters<typeof ingestSearchers>[0]) {
  const result = pending.then(()=>ingestSearchers(payload));
  pending = result.catch(()=>undefined);
  return result;
}
