import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { parseRealworksMutationEmailHtml } from "@/lib/realworksMutations";
import { recalculateActionOpportunities } from "@/lib/actionOpportunities";
import { upsertMarketObjectFromRealworksMutation } from "@/lib/marketObjects";

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Ongeldige JSON payload" }, { status: 400 });
  }

  const record = payload as Record<string, unknown>;
  const html =
    String(record.htmlBody || record.textHtml || record.html || record.bodyHtml || "");
  if (!html.trim()) {
    return NextResponse.json({ error: "htmlBody is verplicht" }, { status: 400 });
  }

  const sourceMessageId =
    String(record.messageId || record.emailId || record.id || "").trim() ||
    `realworks-mutatie-${String(record.subject || "")}-${String(record.date || "")}`;
  const sourceSubject = String(record.subject || "").trim() || null;
  const parsedSourceDate = record.date ? new Date(String(record.date)) : null;
  const sourceDate =
    parsedSourceDate && !Number.isNaN(parsedSourceDate.getTime())
      ? parsedSourceDate
      : null;

  const mutations = parseRealworksMutationEmailHtml(html);
  let created = 0;
  let updated = 0;
  const receivedAt = new Date();

  for (const mutation of mutations) {
    const existing = await prisma.realworksObjectMutation.findUnique({
      where: {
        sourceMessageId_exchangeObjectId_mutationType: {
          sourceMessageId,
          exchangeObjectId: mutation.exchangeObjectId,
          mutationType: mutation.mutationType,
        },
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.realworksObjectMutation.upsert({
        where: {
          sourceMessageId_exchangeObjectId_mutationType: {
            sourceMessageId,
            exchangeObjectId: mutation.exchangeObjectId,
            mutationType: mutation.mutationType,
          },
        },
        update: {
          sourceSubject,
          sourceDate,
          mutationLabel: mutation.mutationLabel,
          mutationDate: mutation.mutationDate ? new Date(mutation.mutationDate) : null,
          moveUrl: mutation.moveUrl,
          addressRaw: mutation.addressRaw,
          street: mutation.street,
          houseNumber: mutation.houseNumber,
          postcode: mutation.postcode,
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
          imageUrl: mutation.imageUrl,
          features: jsonValue(mutation.features),
          rawText: mutation.rawText,
          rawHtml: mutation.rawHtml,
        },
        create: {
          sourceMessageId,
          sourceSubject,
          sourceDate,
          receivedAt,
          mutationType: mutation.mutationType,
          mutationLabel: mutation.mutationLabel,
          mutationDate: mutation.mutationDate ? new Date(mutation.mutationDate) : null,
          exchangeObjectId: mutation.exchangeObjectId,
          moveUrl: mutation.moveUrl,
          addressRaw: mutation.addressRaw,
          street: mutation.street,
          houseNumber: mutation.houseNumber,
          postcode: mutation.postcode,
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
          imageUrl: mutation.imageUrl,
          features: jsonValue(mutation.features),
          rawText: mutation.rawText,
          rawHtml: mutation.rawHtml,
        },
      });

      await upsertMarketObjectFromRealworksMutation(tx, mutation, {
        sourceMessageId,
        sourceSubject,
        sourceDate,
        receivedAt,
      });
    });

    if (existing) updated += 1;
    else created += 1;
  }

  const opportunities = await recalculateActionOpportunities();

  await prisma.realworksMutationIngestRun.upsert({
    where: { sourceMessageId },
    update: {
      sourceSubject,
      sourceDate,
      processedAt: receivedAt,
      status: "success",
      parsed: mutations.length,
      created,
      updated,
      opportunitiesCreated: opportunities.created,
      opportunitiesUpdated: opportunities.updated,
      opportunitiesSkipped: opportunities.skipped,
      error: null,
    },
    create: {
      sourceMessageId,
      sourceSubject,
      sourceDate,
      processedAt: receivedAt,
      status: "success",
      parsed: mutations.length,
      created,
      updated,
      opportunitiesCreated: opportunities.created,
      opportunitiesUpdated: opportunities.updated,
      opportunitiesSkipped: opportunities.skipped,
    },
  });

  return NextResponse.json({
    success: true,
    parsed: mutations.length,
    created,
    updated,
    opportunities,
  });
}
