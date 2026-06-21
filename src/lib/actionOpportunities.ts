import { prisma } from "@/lib/prisma";

const CONTACT_COOLDOWN_DAYS = 7;

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

export async function recalculateActionOpportunities(): Promise<RecalculateResult> {
  const result: RecalculateResult = { created: 0, updated: 0, skipped: 0 };
  const recentMutations = await prisma.realworksObjectMutation.findMany({
    where: {
      mutationType: { in: ["new", "price_changed", "removed", "withdrawn"] },
      receivedAt: { gte: daysAgo(45) },
    },
    orderBy: { receivedAt: "desc" },
    take: 1000,
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

  for (const mutation of recentMutations) {
    if (!["new", "price_changed"].includes(mutation.mutationType)) continue;

    const matches = await prisma.realworksSearchResult.findMany({
      where: {
        exchangeObjectId: mutation.exchangeObjectId,
        OR: [
          { matchingPercentage: { gte: 90 } },
          { dateSent: { not: null } },
          { dateViewed: { not: null } },
          { isLiked: true },
        ],
      },
      take: 100,
    });

    for (const match of matches) {
      const searcher = await prisma.realworksSearcher.findUnique({
        where: { searcherId: match.searcherId },
      });
      if (!searcher || searcher.status !== "LOPEND" || searcher.type !== "BUYING") {
        result.skipped += 1;
        continue;
      }

      const recentPickedUp = await prisma.actionOpportunity.findFirst({
        where: {
          status: { in: ["open", "picked_up"] },
          realworksSearcherId: searcher.searcherId,
          createdAt: { gte: daysAgo(CONTACT_COOLDOWN_DAYS) },
        },
      });
      const sourceKey = `realworks:${searcher.searcherId}:${mutation.exchangeObjectId}:${mutation.mutationType}`;
      if (recentPickedUp && recentPickedUp.sourceKey !== sourceKey) {
        result.skipped += 1;
        continue;
      }

      const objectAddress = match.objectAddress || mutation.addressRaw;
      const objectCity = match.objectCity || mutation.city;
      const objectPrice = match.objectPrice || mutation.askingPrice;
      const reason = reasonFor({
        mutationType: mutation.mutationType,
        matchingPercentage: match.matchingPercentage,
        dateViewed: match.dateViewed,
        dateSent: match.dateSent,
        isLiked: match.isLiked,
        objectAddress,
        objectCity,
        objectPrice,
      });
      const title = `${searcher.clientName || "Zoeker"} - ${objectAddress || "passend object"}`;

      const existing = await prisma.actionOpportunity.findUnique({ where: { sourceKey } });
      await prisma.actionOpportunity.upsert({
        where: { sourceKey },
        update: {
          priority: priorityFor(match),
          title,
          reason,
          suggestedAction: "Neem persoonlijk contact op over dit object.",
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
          priority: priorityFor(match),
          title,
          reason,
          suggestedAction: "Neem persoonlijk contact op over dit object.",
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
