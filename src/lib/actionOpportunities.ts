import { prisma } from "@/lib/prisma";

import { activePreferences, evaluatePreferences, type PreferenceEvent } from "./whatsappPreferences";

type RecalculateResult = {
  created: number;
  updated: number;
  skipped: number;
};

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function priorityFor(match: {
  matchingPercentage: number | null;
  dateViewed: Date | null;
  isLiked: boolean | null;
}) {
  if (match.isLiked) return "urgent";
  if (match.dateViewed) return "high";
  if ((match.matchingPercentage ?? 0) >= 95) return "high";
  return "normal";
}

function formatPrice(price: number | null) {
  if (!price) return null;
  return `€ ${price.toLocaleString("nl-NL")}`;
}

function reasonFor(params: {
  mutationType: string;
  matchingPercentage: number | null;
  dateViewed: Date | null;
  dateSent: Date | null;
  isLiked: boolean | null;
  objectAddress: string | null;
  objectCity: string | null;
  objectPrice: number | null;
}) {
  const parts: string[] = [];
  if (params.mutationType === "new") parts.push("Nieuw object in de mutatielijst");
  if (params.mutationType === "price_changed") parts.push("Prijswijziging op passend object");
  if (params.matchingPercentage !== null) parts.push(`${Math.round(params.matchingPercentage)}% Realworks-match`);
  if (params.dateViewed) parts.push("zoeker heeft dit object bekeken");
  else if (params.dateSent) parts.push("object is al naar de zoeker verzonden maar nog niet bekeken");
  if (params.isLiked) parts.push("zoeker heeft dit object geliket");

  const object = [params.objectAddress, params.objectCity].filter(Boolean).join(", ");
  const price = formatPrice(params.objectPrice);
  if (object || price) parts.push([object, price].filter(Boolean).join(" - "));
  return parts.join(". ");
}

export async function recalculateActionOpportunities(contactIds?: number[]): Promise<RecalculateResult> {
  const result: RecalculateResult = { created: 0, updated: 0, skipped: 0 };
  const preferenceRows = await prisma.appSetting.findMany({where:{key:{startsWith:'wa_preferences:'}}});
  const preferenceByContact = new Map(preferenceRows.map(row=>[row.key, (row.value as unknown as {events?:PreferenceEvent[]}).events || []]));
  const scopedSearchers = contactIds ? await prisma.realworksSearcher.findMany({where:{mauticContactId:{in:contactIds}},select:{searcherId:true}}) : null;
  const scopedObjectIds = scopedSearchers ? await prisma.realworksSearchResult.findMany({where:{searcherId:{in:scopedSearchers.map(s=>s.searcherId)}},select:{exchangeObjectId:true},distinct:['exchangeObjectId']}) : null;
  const recentMutations = await prisma.realworksObjectMutation.findMany({
    where: {
      ...(scopedObjectIds ? {exchangeObjectId:{in:scopedObjectIds.map(o=>o.exchangeObjectId)}} : {}),
      mutationType: { in: ["new", "price_changed", "removed", "withdrawn"] },
      receivedAt: { gte: daysAgo(45) },
    },
    orderBy: { receivedAt: "desc" },
    ...(contactIds ? {} : {take:1000}),

  });

  const closingObjectIds = new Set(
    recentMutations
      .filter((m) => ["removed", "withdrawn"].includes(m.mutationType))
      .map((m) => m.exchangeObjectId)
  );

  if (closingObjectIds.size) {
    await prisma.actionOpportunity.updateMany({
      where: {
        status: "open",
        exchangeObjectId: { in: Array.from(closingObjectIds) },
      },
      data: {
        status: "done",
        completedAt: new Date(),
        reason: "Object is afgemeld of ingetrokken in Realworks.",
      },
    });
  }

  const seenMutations = new Set<string>();
  for (const mutation of recentMutations) {
    if (!["new", "price_changed"].includes(mutation.mutationType)) continue;
    const mutationKey = mutation.exchangeObjectId+':'+mutation.mutationType;
    if (seenMutations.has(mutationKey)) continue;
    seenMutations.add(mutationKey);

    const marketSource = await prisma.marketObjectSource.findUnique({
      where: {
        source_sourceObjectId: {
          source: "realworks",
          sourceObjectId: mutation.exchangeObjectId,
        },
      },
      include: { marketObject: { include: { enrichments: { where: { status: "success" } } } } },
    });
    const marketObject = marketSource?.marketObject ?? null;
    if (marketObject && marketObject.status !== "active") {
      result.skipped += 1;
      continue;
    }

    const matches = await prisma.realworksSearchResult.findMany({
      where: {
        exchangeObjectId: mutation.exchangeObjectId,
        ...(scopedSearchers ? {searcherId:{in:scopedSearchers.map(s=>s.searcherId)}} : {}),
        OR: [
          { matchingPercentage: { gte: 90 } },
          { dateSent: { not: null } },
          { dateViewed: { not: null } },
          { isLiked: true },
        ],
      },

    });

    for (const match of matches) {
      const searcher = await prisma.realworksSearcher.findUnique({
        where: { searcherId: match.searcherId },
      });
      if (!searcher || searcher.lastSyncedAt < daysAgo(1) || searcher.status !== "LOPEND" || searcher.type !== "BUYING") {
        result.skipped += 1;
        continue;
      }

      const sourceKey = `realworks:${searcher.searcherId}:${mutation.exchangeObjectId}:${mutation.mutationType}`;
      const events = preferenceByContact.get('wa_preferences:'+searcher.mauticContactId) || [];
      const preferences = activePreferences(events);
      // Keep unrelated dossiers on their established opportunity-selection policy.
      if (!preferences.length && !contactIds) {
        const recent = await prisma.actionOpportunity.findFirst({where:{status:{in:['open','picked_up']},realworksSearcherId:searcher.searcherId,createdAt:{gte:daysAgo(7)}}});
        if (recent && recent.sourceKey !== sourceKey) { result.skipped++; continue; }
      }
      const assessment = evaluatePreferences(preferences, {
        text: marketObject?.enrichments.map(e=>e.listingText||'').join('\n') || '',
        bedrooms:marketObject?.bedrooms, livingArea:marketObject?.livingArea,
        price:marketObject?.askingPrice ?? match.objectPrice, city:marketObject?.city ?? match.objectCity,
      });
      const priority = assessment.conflicts.length ? 'low' : preferences.length ?
        (assessment.matched.length && !assessment.unknown.length ? 'high' : 'normal') : priorityFor(match);
      const suggestedAction = assessment.hardConflict ? 'Niet voorstellen: strijdig met een expliciete eis. Controleer eerst de bron.' :
        'Beoordeel de woonvoorkeuren en ontbrekende woningkenmerken. Controleer recent contact, actieve dossiers en afspraken voordat je contact voorstelt.';
      const objectAddress = match.objectAddress || marketObject?.addressRaw || mutation.addressRaw;
      const objectCity = match.objectCity || marketObject?.city || mutation.city;
      const objectPrice = match.objectPrice || marketObject?.askingPrice || mutation.askingPrice;
      const reason = reasonFor({
        mutationType: mutation.mutationType,
        matchingPercentage: match.matchingPercentage,
        dateViewed: match.dateViewed,
        dateSent: match.dateSent,
        isLiked: match.isLiked,
        objectAddress,
        objectCity,
        objectPrice,
      }) + (assessment.reason ? ". WhatsApp-voorkeuren: " + assessment.reason : "");
      const title = `${searcher.clientName || "Zoeker"} - ${objectAddress || "passend object"}`;

      const existing = await prisma.actionOpportunity.findUnique({ where: { sourceKey } });
      if (assessment.hardConflict && !existing) { result.skipped++; continue; }
      await prisma.actionOpportunity.upsert({
        where: { sourceKey },
        update: {
          priority,
          title,
          reason,
          suggestedAction,
          contactName: searcher.clientName,
          contactEmail: searcher.clientEmail,
          contactPhone: searcher.clientPhone,
          mauticContactId: searcher.mauticContactId,
          realworksSearcherId: searcher.searcherId,
          exchangeObjectId: mutation.exchangeObjectId,
          objectAddress,
          objectCity,
          objectPrice,
        },
        create: {
          sourceType: "realworks_object_match",
          sourceKey,
          priority,
          title,
          reason,
          suggestedAction,
          contactName: searcher.clientName,
          contactEmail: searcher.clientEmail,
          contactPhone: searcher.clientPhone,
          mauticContactId: searcher.mauticContactId,
          realworksSearcherId: searcher.searcherId,
          exchangeObjectId: mutation.exchangeObjectId,
          objectAddress,
          objectCity,
          objectPrice,
        },
      });
      if (existing) result.updated += 1;
      else result.created += 1;
    }
  }

  return result;
}
