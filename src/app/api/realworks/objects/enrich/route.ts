import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { extractMoveObjectPage } from "@/lib/marketObjects";
import { prisma } from "@/lib/prisma";

function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function limitFromBody(body: unknown) {
  const value =
    body && typeof body === "object" && "limit" in body
      ? Number((body as Record<string, unknown>).limit)
      : 20;
  return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 50)) : 20;
}

async function fetchMoveHtml(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "DeVreePlatform/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Move gaf HTTP ${response.status}`);
  return response.text();
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const limit = limitFromBody(body);
  const candidates = await prisma.marketObject.findMany({
    where: {
      status: "active",
      sources: { some: { source: "realworks", sourceUrl: { not: null } } },
      OR: [
        { enrichments: { none: { source: "move" } } },
        { enrichments: { some: { source: "move", status: "failed" } } },
        { enrichments: { some: { source: "move", enrichedAt: { lt: daysAgo(14) } } } },
      ],
    },
    include: { sources: true },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });

  let enriched = 0;
  let failed = 0;

  for (const object of candidates) {
    const source = object.sources.find((item) => item.source === "realworks" && item.sourceUrl);
    if (!source?.sourceUrl) continue;

    try {
      const html = await fetchMoveHtml(source.sourceUrl);
      const extracted = extractMoveObjectPage(html);
      await prisma.marketObjectEnrichment.upsert({
        where: {
          marketObjectId_source: {
            marketObjectId: object.id,
            source: "move",
          },
        },
        update: {
          status: "success",
          title: extracted.title,
          listingText: extracted.listingText,
          features: jsonValue(extracted.features),
          images: jsonValue(extracted.images),
          enrichedAt: new Date(),
          error: null,
        },
        create: {
          marketObjectId: object.id,
          source: "move",
          status: "success",
          title: extracted.title,
          listingText: extracted.listingText,
          features: jsonValue(extracted.features),
          images: jsonValue(extracted.images),
          enrichedAt: new Date(),
        },
      });
      enriched += 1;
    } catch (error) {
      await prisma.marketObjectEnrichment.upsert({
        where: {
          marketObjectId_source: {
            marketObjectId: object.id,
            source: "move",
          },
        },
        update: {
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 1000) : "Onbekende fout",
          enrichedAt: new Date(),
        },
        create: {
          marketObjectId: object.id,
          source: "move",
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 1000) : "Onbekende fout",
          enrichedAt: new Date(),
        },
      });
      failed += 1;
    }
  }

  return NextResponse.json({
    success: true,
    candidates: candidates.length,
    enriched,
    failed,
  });
}
