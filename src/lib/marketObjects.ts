import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ParsedRealworksMutation } from "@/lib/realworksMutations";

const CLOSED_OBJECT_RETENTION_MONTHS = 6;
const MAX_LISTING_TEXT_LENGTH = 30_000;

type Db = Prisma.TransactionClient | typeof prisma;

type RealworksMutationContext = {
  sourceMessageId: string;
  sourceSubject: string | null;
  sourceDate: Date | null;
  receivedAt?: Date;
};

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

export function normalizePostcode(value: string | null | undefined) {
  const normalized = String(value || "").replace(/\s+/g, "").toUpperCase();
  return /^[1-9][0-9]{3}[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function splitHouseNumber(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)\s*([A-Za-z0-9/-].*)?$/);
  if (!match) return { houseNumber: raw || null, houseNumberAddition: null };
  const addition = (match[2] || "")
    .trim()
    .replace(/^[\s-/]+/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return {
    houseNumber: match[1],
    houseNumberAddition: addition || null,
  };
}

export function canonicalAddressKey(params: {
  postcode: string | null | undefined;
  houseNumber: string | null | undefined;
  houseNumberAddition?: string | null | undefined;
}) {
  const postcode = normalizePostcode(params.postcode);
  const houseNumber = String(params.houseNumber || "").trim();
  if (!postcode || !houseNumber) return null;
  const addition = String(params.houseNumberAddition || "").trim().toUpperCase();
  return [postcode, houseNumber, addition].join(":");
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function isClosingMutation(mutationType: string) {
  return mutationType === "removed" || mutationType === "withdrawn";
}

function marketStatusForMutation(mutationType: string) {
  return isClosingMutation(mutationType) ? mutationType : "active";
}

function definedFields<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

function marketObjectFieldsFromMutation(mutation: ParsedRealworksMutation) {
  const split = splitHouseNumber(mutation.houseNumber);
  const postcode = normalizePostcode(mutation.postcode);
  const canonicalKey = canonicalAddressKey({
    postcode,
    houseNumber: split.houseNumber,
    houseNumberAddition: split.houseNumberAddition,
  });

  return {
    canonicalKey,
    addressRaw: mutation.addressRaw,
    street: mutation.street,
    houseNumber: split.houseNumber,
    houseNumberAddition: split.houseNumberAddition,
    postcode,
    city: mutation.city,
    objectKind: mutation.objectKind,
    objectSubType: mutation.objectSubType,
    askingPrice: mutation.askingPrice,
    transactionPrice: mutation.transactionPrice,
    rooms: mutation.rooms,
    bedrooms: mutation.bedrooms,
    livingArea: mutation.livingArea,
    plotArea: mutation.plotArea,
    buildYear: mutation.buildYear,
    brokerName: mutation.brokerName,
    brokerEmail: mutation.brokerEmail,
    primaryImageUrl: mutation.imageUrl,
  };
}

export async function upsertMarketObjectFromRealworksMutation(
  db: Db,
  mutation: ParsedRealworksMutation,
  context: RealworksMutationContext
) {
  const now = context.receivedAt || new Date();
  const eventDate =
    (mutation.mutationDate ? new Date(mutation.mutationDate) : null) ||
    context.sourceDate ||
    now;
  const closedAt = isClosingMutation(mutation.mutationType) ? eventDate : null;
  const fields = marketObjectFieldsFromMutation(mutation);
  const sourcePayload = {
    sourceMessageId: context.sourceMessageId,
    sourceSubject: context.sourceSubject,
    sourceDate: context.sourceDate?.toISOString() ?? null,
    mutationType: mutation.mutationType,
    mutationLabel: mutation.mutationLabel,
  };

  const existingSource = await db.marketObjectSource.findUnique({
    where: {
      source_sourceObjectId: {
        source: "realworks",
        sourceObjectId: mutation.exchangeObjectId,
      },
    },
  });

  let marketObjectId = existingSource?.marketObjectId ?? null;
  if (!marketObjectId && fields.canonicalKey) {
    const existingByAddress = await db.marketObject.findUnique({
      where: { canonicalKey: fields.canonicalKey },
      select: { id: true },
    });
    marketObjectId = existingByAddress?.id ?? null;
  }

  let canonicalKey = fields.canonicalKey;
  if (marketObjectId && fields.canonicalKey) {
    const existingByAddress = await db.marketObject.findUnique({
      where: { canonicalKey: fields.canonicalKey },
      select: { id: true },
    });
    if (existingByAddress && existingByAddress.id !== marketObjectId) {
      canonicalKey = null;
    }
  }

  const sharedData = definedFields({
    ...fields,
    canonicalKey,
    status: marketStatusForMutation(mutation.mutationType),
    lastSeenAt: now,
    lastMutationAt: eventDate,
    closedAt,
    deleteAfter: closedAt ? addMonths(closedAt, CLOSED_OBJECT_RETENTION_MONTHS) : null,
  });

  const marketObject = marketObjectId
    ? await db.marketObject.update({
        where: { id: marketObjectId },
        data: {
          ...sharedData,
          ...(closedAt ? {} : { closedAt: null, deleteAfter: null }),
        },
      })
    : await db.marketObject.create({
        data: {
          ...definedFields(fields),
          status: marketStatusForMutation(mutation.mutationType),
          firstSeenAt: eventDate,
          lastSeenAt: now,
          lastMutationAt: eventDate,
          closedAt,
          deleteAfter: closedAt ? addMonths(closedAt, CLOSED_OBJECT_RETENTION_MONTHS) : null,
        },
      });

  await db.marketObjectSource.upsert({
    where: {
      source_sourceObjectId: {
        source: "realworks",
        sourceObjectId: mutation.exchangeObjectId,
      },
    },
    update: {
      marketObjectId: marketObject.id,
      sourceUrl: mutation.moveUrl,
      confidence: fields.canonicalKey ? 1 : 0.85,
      rawPayload: jsonValue(sourcePayload),
      lastSeenAt: now,
    },
    create: {
      marketObjectId: marketObject.id,
      source: "realworks",
      sourceObjectId: mutation.exchangeObjectId,
      sourceUrl: mutation.moveUrl,
      confidence: fields.canonicalKey ? 1 : 0.85,
      rawPayload: jsonValue(sourcePayload),
      firstSeenAt: eventDate,
      lastSeenAt: now,
    },
  });

  return marketObject;
}

function decodeHtml(value: string) {
  return value
    .replace(/\\u0026/g, "&")
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

function cleanText(value: string) {
  return decodeHtml(value)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractMoveObjectPage(html: string) {
  const normalized = html.replace(/\\"/g, '"').replace(/\\u0026/g, "&");
  const title =
    cleanText(
      normalized.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ||
        normalized.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
        ""
    ).slice(0, 191) || null;
  const listingText =
    cleanText(
      normalized.match(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i)?.[1] ||
        normalized.match(/property="og:description"\s+content="([\s\S]*?)"/i)?.[1] ||
        ""
    ).slice(0, MAX_LISTING_TEXT_LENGTH) || null;

  const images = Array.from(
    new Set(
      Array.from(
        normalized.matchAll(/https:\/\/images\.realworks\.nl\/servlets\/images\/uitwisseling\.objectmedia\/[^"' <\\]+/g)
      ).map((match) => decodeHtml(match[0]))
    )
  ).slice(0, 80);

  const kenmerken = Array.from(
    normalized.matchAll(/"label":"([^"]+)","value":"([^"]*)"/g)
  )
    .map((match) => ({ label: cleanText(match[1]), value: cleanText(match[2]) }))
    .filter((item) => item.label && item.value)
    .slice(0, 200);

  return {
    title,
    listingText,
    features: { kenmerken },
    images,
  };
}

export async function cleanupExpiredMarketObjects(limit = 250) {
  const now = new Date();
  const objects = await prisma.marketObject.findMany({
    where: {
      status: { in: ["removed", "withdrawn"] },
      deleteAfter: { lte: now },
    },
    include: { sources: true },
    orderBy: { deleteAfter: "asc" },
    take: Math.max(1, Math.min(limit, 1000)),
  });

  let deleted = 0;
  for (const object of objects) {
    const exchangeObjectIds = object.sources
      .filter((source) => source.source === "realworks" && source.sourceObjectId)
      .map((source) => source.sourceObjectId as string);

    await prisma.$transaction(async (tx) => {
      await tx.marketObjectTombstone.create({
        data: {
          marketObjectId: object.id,
          canonicalKey: object.canonicalKey,
          exchangeObjectIds: jsonValue(exchangeObjectIds),
          status: object.status,
          addressRaw: object.addressRaw,
          postcode: object.postcode,
          city: object.city,
          askingPrice: object.askingPrice,
          transactionPrice: object.transactionPrice,
          closedAt: object.closedAt,
          reason: "retention_expired",
        },
      });

      if (exchangeObjectIds.length) {
        await tx.realworksObjectMutation.deleteMany({
          where: { exchangeObjectId: { in: exchangeObjectIds } },
        });
      }
      await tx.marketObject.delete({ where: { id: object.id } });
    });
    deleted += 1;
  }

  return { deleted };
}
