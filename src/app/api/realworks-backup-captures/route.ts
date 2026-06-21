import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { recalculateActionOpportunities } from "@/lib/actionOpportunities";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

const MAX_RESPONSE_BODY_CHARS = 200000;

type RealworksNetworkCapture = {
  source?: string;
  captured_at?: string;
  page_url?: string;
  host?: string;
  path?: string;
  query?: string;
  hints?: string[];
  transport?: string;
  method?: string;
  url?: string;
  status?: number;
  content_type?: string;
  request_body_preview?: string;
  response_truncated?: boolean;
  response_body?: string;
  link_text?: string;
  link_target?: string;
  onclick_preview?: string;
  popup_target?: string;
  popup_features?: string;
  form_target?: string;
  form_name?: string;
  form_id?: string;
  form_trigger?: string;
};

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

async function ingestSearchersCapture(capture: RealworksNetworkCapture) {
  if (!capture.source?.includes("realworks_search")) return null;
  let preview: Record<string, unknown>;
  try {
    preview = JSON.parse(capture.request_body_preview || "{}");
  } catch {
    return null;
  }

  let searchersUpserted = 0;
  let resultsUpserted = 0;

  for (const item of asArray(preview.searchers)) {
    const searcher = asRecord(asRecord(item).node || item);
    const client = asRecord(asArray(searcher.clients)[0]);
    const price = asRecord(searcher.price);
    const moveAccountDetails = asRecord(client.moveAccountDetails);
    const emails = asArray(client.emailAddresses).map(asRecord);
    const phones = asArray(client.phoneNumbers).map(asRecord);
    const searcherId = firstString(searcher.id, searcher.searcherId);
    if (!searcherId) continue;

    await prisma.realworksSearcher.upsert({
      where: { searcherId },
      update: {
        type: firstString(searcher.type),
        status: firstString(searcher.status),
        reference: firstString(searcher.reference),
        objectKind: firstString(searcher.objectKind),
        relationSystemId: firstString(moveAccountDetails.relationSystemId, client.relationSystemId),
        clientName: firstString(client.name, client.fullName, searcher.clientName),
        clientEmail: firstString(emails[0]?.email, emails[0]?.value, client.email),
        clientPhone: firstString(phones[0]?.number, phones[0]?.value, client.phone, client.mobile),
        mauticContactId: asNumber(searcher.mauticContactId),
        priceMin: asNumber(price.from ?? price.min),
        priceMax: asNumber(price.to ?? price.max),
        locations: jsonValue(searcher.locationFilters ?? searcher.allLocInfo ?? null),
        criteria: jsonValue({
          properties: searcher.properties ?? null,
          hardSoftCriteria: searcher.hardSoftCriteria ?? null,
          houseTypes: searcher.houseTypes ?? null,
          apartmentTypes: searcher.apartmentTypes ?? null,
        }),
        notes: firstString(searcher.notes),
        raw: jsonValue(searcher),
        lastSyncedAt: new Date(),
      },
      create: {
        searcherId,
        type: firstString(searcher.type),
        status: firstString(searcher.status),
        reference: firstString(searcher.reference),
        objectKind: firstString(searcher.objectKind),
        relationSystemId: firstString(moveAccountDetails.relationSystemId, client.relationSystemId),
        clientName: firstString(client.name, client.fullName, searcher.clientName),
        clientEmail: firstString(emails[0]?.email, emails[0]?.value, client.email),
        clientPhone: firstString(phones[0]?.number, phones[0]?.value, client.phone, client.mobile),
        mauticContactId: asNumber(searcher.mauticContactId),
        priceMin: asNumber(price.from ?? price.min),
        priceMax: asNumber(price.to ?? price.max),
        locations: jsonValue(searcher.locationFilters ?? searcher.allLocInfo ?? null),
        criteria: jsonValue({
          properties: searcher.properties ?? null,
          hardSoftCriteria: searcher.hardSoftCriteria ?? null,
          houseTypes: searcher.houseTypes ?? null,
          apartmentTypes: searcher.apartmentTypes ?? null,
        }),
        notes: firstString(searcher.notes),
        raw: jsonValue(searcher),
      },
    });
    searchersUpserted += 1;
  }

  for (const item of asArray(preview.results)) {
    const result = asRecord(asRecord(item).node || item);
    const exchangeObject = asRecord(result.exchangeObject);
    const address = asRecord(exchangeObject.address);
    const price = asRecord(exchangeObject.price);
    const searcherId = firstString(result.searcherId);
    const exchangeObjectId = firstString(result.exchangeObjectId, exchangeObject.id);
    if (!searcherId || !exchangeObjectId) continue;

    await prisma.realworksSearchResult.upsert({
      where: { searcherId_exchangeObjectId: { searcherId, exchangeObjectId } },
      update: {
        searchResultsId: firstString(result.searchResultsId, result.id),
        exchangeObjectEntityType: firstString(result.exchangeObjectEntityType),
        searchResultStatus: firstString(result.searchResultStatus),
        matchingPercentage: asNumber(result.matchingPercentage),
        dateFound: asDate(result.dateFound),
        dateSent: asDate(result.dateSent),
        dateViewed: asDate(result.dateViewed),
        dateContactFormClicked: asDate(result.dateContactFormClicked),
        isLiked: typeof result.isLiked === "boolean" ? result.isLiked : null,
        objectAddress: firstString(exchangeObject.addressLine, exchangeObject.displayAddress, [address.street, address.houseNumber, address.houseNumberAddition].filter(Boolean).join(" ")),
        objectCity: firstString(address.city, exchangeObject.city),
        objectPrice: asNumber(price.amount ?? price.value ?? exchangeObject.price),
        objectUrl: firstString(exchangeObject.url, exchangeObject.moveUrl),
        matchedCriteria: jsonValue(result.matchedSearchCriteria ?? null),
        nonMatchedCriteria: jsonValue(result.nonMatchedSearchCriteria ?? null),
        raw: jsonValue(result),
        lastSyncedAt: new Date(),
      },
      create: {
        searcherId,
        searchResultsId: firstString(result.searchResultsId, result.id),
        exchangeObjectId,
        exchangeObjectEntityType: firstString(result.exchangeObjectEntityType),
        searchResultStatus: firstString(result.searchResultStatus),
        matchingPercentage: asNumber(result.matchingPercentage),
        dateFound: asDate(result.dateFound),
        dateSent: asDate(result.dateSent),
        dateViewed: asDate(result.dateViewed),
        dateContactFormClicked: asDate(result.dateContactFormClicked),
        isLiked: typeof result.isLiked === "boolean" ? result.isLiked : null,
        objectAddress: firstString(exchangeObject.addressLine, exchangeObject.displayAddress, [address.street, address.houseNumber, address.houseNumberAddition].filter(Boolean).join(" ")),
        objectCity: firstString(address.city, exchangeObject.city),
        objectPrice: asNumber(price.amount ?? price.value ?? exchangeObject.price),
        objectUrl: firstString(exchangeObject.url, exchangeObject.moveUrl),
        matchedCriteria: jsonValue(result.matchedSearchCriteria ?? null),
        nonMatchedCriteria: jsonValue(result.nonMatchedSearchCriteria ?? null),
        raw: jsonValue(result),
      },
    });
    resultsUpserted += 1;
  }

  if (!searchersUpserted && !resultsUpserted) return null;
  const opportunities = await recalculateActionOpportunities();
  return { searchers: searchersUpserted, results: resultsUpserted, opportunities };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const capture = await request.json() as RealworksNetworkCapture;
  if (!capture?.url || typeof capture.url !== "string") {
    return NextResponse.json({ error: "url is verplicht" }, { status: 400, headers: CORS_HEADERS });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(capture.url);
  } catch {
    return NextResponse.json({ error: "url is ongeldig" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!["backup.realworks.nl", "crm.realworks.nl"].includes(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: "Alleen Realworks hosts zijn toegestaan" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const normalizedCapture = {
    ...capture,
    received_at: new Date().toISOString(),
    host: parsedUrl.hostname,
    path: parsedUrl.pathname,
    query: parsedUrl.search,
    response_body: typeof capture.response_body === "string"
      ? capture.response_body.slice(0, MAX_RESPONSE_BODY_CHARS)
      : "",
  };

  console.log("[realworks-backup-capture]", {
    source: normalizedCapture.source,
    host: normalizedCapture.host,
    path: normalizedCapture.path,
    query: normalizedCapture.query,
    url: normalizedCapture.url,
    pageUrl: normalizedCapture.page_url,
    method: normalizedCapture.method,
    status: normalizedCapture.status,
    contentType: normalizedCapture.content_type,
    responseChars: normalizedCapture.response_body.length,
    truncated: normalizedCapture.response_truncated,
    transport: normalizedCapture.transport,
    linkText: "link_text" in normalizedCapture ? normalizedCapture.link_text : undefined,
    linkTarget: "link_target" in normalizedCapture ? normalizedCapture.link_target : undefined,
    popupTarget: "popup_target" in normalizedCapture ? normalizedCapture.popup_target : undefined,
    onclickPreview: "onclick_preview" in normalizedCapture ? normalizedCapture.onclick_preview : undefined,
    formTarget: "form_target" in normalizedCapture ? normalizedCapture.form_target : undefined,
    formName: "form_name" in normalizedCapture ? normalizedCapture.form_name : undefined,
    formId: "form_id" in normalizedCapture ? normalizedCapture.form_id : undefined,
    formTrigger: "form_trigger" in normalizedCapture ? normalizedCapture.form_trigger : undefined,
    requestBodyPreview: normalizedCapture.request_body_preview?.slice(0, 4000),
  });

  const ingestResult = await ingestSearchersCapture(normalizedCapture);

  const configuredWebhookUrl = process.env.REALWORKS_BACKUP_CAPTURE_WEBHOOK_URL;
  const n8nUrl = process.env.N8N_URL;
  const webhookUrl = configuredWebhookUrl
    || (n8nUrl ? `${n8nUrl.replace(/\/$/, "")}/webhook/realworks-backup-capture` : null);

  if (!webhookUrl) {
    return NextResponse.json(
      { success: true, forwarded: false, reason: "Geen capture webhook geconfigureerd", ingest: ingestResult },
      { headers: CORS_HEADERS }
    );
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(normalizedCapture),
    });

    return NextResponse.json(
      { success: true, forwarded: res.ok, webhookStatus: res.status, ingest: ingestResult },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.warn("[realworks-backup-capture] webhook forward mislukt:", error);
    return NextResponse.json(
      { success: true, forwarded: false, error: "Webhook forward mislukt" },
      { headers: CORS_HEADERS }
    );
  }
}
