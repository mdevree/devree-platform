import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const STALE_AFTER_HOURS = 48;
const OWN_BROKER_PATTERN = "%de vree%";
const CITY_ALIASES: Record<string, string> = {
  hoogvliet: "Hoogvliet Rotterdam",
};

type MarketStatsRow = {
  active_colleague_objects: bigint | number | null;
  colleague_brokers: bigint | number | null;
  last_seen_at: Date | null;
};

function normalizeCity(value: string | null) {
  const city = value?.trim();
  if (!city) return null;
  const normalized = city.slice(0, 80);
  return CITY_ALIASES[normalized.toLowerCase()] ?? normalized;
}

function toNumber(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function hoursSince(date: Date | null) {
  if (!date) return null;
  return Math.round((Date.now() - date.getTime()) / (60 * 60 * 1000));
}

export async function GET(request: NextRequest) {
  const city = normalizeCity(request.nextUrl.searchParams.get("city"));
  const cityFilter = city
    ? Prisma.sql`AND LOWER(city) = LOWER(${city})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<MarketStatsRow[]>`
    SELECT
      COUNT(*) AS active_colleague_objects,
      COUNT(DISTINCT NULLIF(TRIM(brokerName), '')) AS colleague_brokers,
      MAX(lastSeenAt) AS last_seen_at
    FROM market_objects
    WHERE status = 'active'
      AND closedAt IS NULL
      AND (deleteAfter IS NULL OR deleteAfter > NOW())
      AND LOWER(COALESCE(brokerName, '')) NOT LIKE ${OWN_BROKER_PATTERN}
      ${cityFilter}
  `;

  const stats = rows[0] ?? {
    active_colleague_objects: 0,
    colleague_brokers: 0,
    last_seen_at: null,
  };
  const latestAgeHours = hoursSince(stats.last_seen_at);

  return NextResponse.json(
    {
      scope: city ? "city" : "region",
      city,
      active_colleague_objects: toNumber(stats.active_colleague_objects),
      colleague_brokers: toNumber(stats.colleague_brokers),
      last_seen_date: stats.last_seen_at
        ? stats.last_seen_at.toISOString().slice(0, 10)
        : null,
      stale: latestAgeHours === null || latestAgeHours > STALE_AFTER_HOURS,
      stale_after_hours: STALE_AFTER_HOURS,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=43200",
      },
    }
  );
}
