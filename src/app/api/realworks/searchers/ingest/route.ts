import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { recalculateActionOpportunities } from "@/lib/actionOpportunities";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function firstClient(searcher: Record<string, unknown>) {
  const clients = asArray(searcher.clients);
  return asRecord(clients[0]);
}

function clientPhone(client: Record<string, unknown>) {
  const phones = asArray(client.phoneNumbers);
  const first = asRecord(phones[0]);
  return firstString(first.number, first.value, first.phoneNumber, client.phone, client.mobile);
}

function clientEmail(client: Record<string, unknown>) {
  const emails = asArray(client.emailAddresses);
  const first = asRecord(emails[0]);
  return firstString(first.email, first.value, client.email);
}

function normalizeSearcher(input: unknown) {
  const searcher = asRecord(asRecord(input).node || input);
  const client = firstClient(searcher);
  const moveAccountDetails = asRecord(client.moveAccountDetails);
  const price = asRecord(searcher.price);
  return {
    searcherId: firstString(searcher.id, searcher.searcherId),
    type: firstString(searcher.type),
    status: firstString(searcher.status),
    reference: firstString(searcher.reference),
    objectKind: firstString(searcher.objectKind),
    relationSystemId: firstString(moveAccountDetails.relationSystemId, client.relationSystemId),
    clientName: firstString(client.name, client.fullName, searcher.clientName),
    clientEmail: clientEmail(client),
    clientPhone: clientPhone(client),
    mauticContactId: asNumber(searcher.mauticContactId),
    priceMin: asNumber(price.from ?? price.min ?? price.priceFrom),
    priceMax: asNumber(price.to ?? price.max ?? price.priceTo),
    locations: searcher.locationFilters ?? searcher.allLocInfo ?? null,
    criteria: {
      properties: searcher.properties ?? null,
      hardSoftCriteria: searcher.hardSoftCriteria ?? null,
      objectTypes: searcher.objectTypes ?? null,
      houseTypes: searcher.houseTypes ?? null,
      apartmentTypes: searcher.apartmentTypes ?? null,
    },
    notes: firstString(searcher.notes),
    raw: searcher,
  };
}

function normalizeResult(input: unknown) {
  const result = asRecord(asRecord(input).node || input);
  const exchangeObject = asRecord(result.exchangeObject);
  const address = asRecord(exchangeObject.address);
  const price = asRecord(exchangeObject.price);
  return {
    searcherId: firstString(result.searcherId),
    searchResultsId: firstString(result.searchResultsId, result.id),
    exchangeObjectId: firstString(result.exchangeObjectId, exchangeObject.id),
    exchangeObjectEntityType: firstString(result.exchangeObjectEntityType),
    searchResultStatus: firstString(result.searchResultStatus),
    matchingPercentage: asNumber(result.matchingPercentage),
    dateFound: asDate(result.dateFound),
    dateSent: asDate(result.dateSent),
    dateViewed: asDate(result.dateViewed),
    dateContactFormClicked: asDate(result.dateContactFormClicked),
    isLiked: typeof result.isLiked === "boolean" ? result.isLiked : null,
    objectAddress: firstString(
      exchangeObject.addressLine,
      exchangeObject.displayAddress,
      [address.street, address.houseNumber, address.houseNumberAddition].filter(Boolean).join(" ")
    ),
    objectCity: firstString(address.city, exchangeObject.city),
    objectPrice: asNumber(price.amount ?? price.value ?? exchangeObject.price),
    objectUrl: firstString(exchangeObject.url, exchangeObject.moveUrl),
    matchedCriteria: result.matchedSearchCriteria ?? null,
    nonMatchedCriteria: result.nonMatchedSearchCriteria ?? null,
    raw: result,
  };
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const body = asRecord(payload);
  const searchers = asArray(body.searchers ?? body.edges);
  const results = asArray(body.results ?? body.searchResults);
  let searchersUpserted = 0;
  let resultsUpserted = 0;

  for (const input of searchers) {
    const searcher = normalizeSearcher(input);
    if (!searcher.searcherId) continue;
    await prisma.realworksSearcher.upsert({
      where: { searcherId: searcher.searcherId },
      update: {
        type: searcher.type,
        status: searcher.status,
        reference: searcher.reference,
        objectKind: searcher.objectKind,
        relationSystemId: searcher.relationSystemId,
        clientName: searcher.clientName,
        clientEmail: searcher.clientEmail,
        clientPhone: searcher.clientPhone,
        mauticContactId: searcher.mauticContactId,
        priceMin: searcher.priceMin,
        priceMax: searcher.priceMax,
        locations: jsonValue(searcher.locations),
        criteria: jsonValue(searcher.criteria),
        notes: searcher.notes,
        raw: jsonValue(searcher.raw),
        lastSyncedAt: new Date(),
      },
      create: {
        searcherId: searcher.searcherId,
        type: searcher.type,
        status: searcher.status,
        reference: searcher.reference,
        objectKind: searcher.objectKind,
        relationSystemId: searcher.relationSystemId,
        clientName: searcher.clientName,
        clientEmail: searcher.clientEmail,
        clientPhone: searcher.clientPhone,
        mauticContactId: searcher.mauticContactId,
        priceMin: searcher.priceMin,
        priceMax: searcher.priceMax,
        locations: jsonValue(searcher.locations),
        criteria: jsonValue(searcher.criteria),
        notes: searcher.notes,
        raw: jsonValue(searcher.raw),
      },
    });
    searchersUpserted += 1;
  }

  for (const input of results) {
    const result = normalizeResult(input);
    if (!result.searcherId || !result.exchangeObjectId) continue;
    const searcherId = result.searcherId;
    const exchangeObjectId = result.exchangeObjectId;
    await prisma.realworksSearchResult.upsert({
      where: {
        searcherId_exchangeObjectId: {
          searcherId,
          exchangeObjectId,
        },
      },
      update: {
        searchResultsId: result.searchResultsId,
        exchangeObjectEntityType: result.exchangeObjectEntityType,
        searchResultStatus: result.searchResultStatus,
        matchingPercentage: result.matchingPercentage,
        dateFound: result.dateFound,
        dateSent: result.dateSent,
        dateViewed: result.dateViewed,
        dateContactFormClicked: result.dateContactFormClicked,
        isLiked: result.isLiked,
        objectAddress: result.objectAddress,
        objectCity: result.objectCity,
        objectPrice: result.objectPrice,
        objectUrl: result.objectUrl,
        matchedCriteria: jsonValue(result.matchedCriteria),
        nonMatchedCriteria: jsonValue(result.nonMatchedCriteria),
        raw: jsonValue(result.raw),
        lastSyncedAt: new Date(),
      },
      create: {
        searcherId,
        searchResultsId: result.searchResultsId,
        exchangeObjectId,
        exchangeObjectEntityType: result.exchangeObjectEntityType,
        searchResultStatus: result.searchResultStatus,
        matchingPercentage: result.matchingPercentage,
        dateFound: result.dateFound,
        dateSent: result.dateSent,
        dateViewed: result.dateViewed,
        dateContactFormClicked: result.dateContactFormClicked,
        isLiked: result.isLiked,
        objectAddress: result.objectAddress,
        objectCity: result.objectCity,
        objectPrice: result.objectPrice,
        objectUrl: result.objectUrl,
        matchedCriteria: jsonValue(result.matchedCriteria),
        nonMatchedCriteria: jsonValue(result.nonMatchedCriteria),
        raw: jsonValue(result.raw),
      },
    });
    resultsUpserted += 1;
  }

  const opportunities = await recalculateActionOpportunities();

  return NextResponse.json({
    success: true,
    searchers: searchersUpserted,
    results: resultsUpserted,
    opportunities,
  });
}
