import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const ALLOWED_EVENT_TYPES = new Set([
  "landing",
  "planner_opened",
  "calendly_widget_loaded",
  "calendly_time_selected",
  "calendly_scheduled",
  "phone_click",
  "whatsapp_click",
  "email_click",
]);

const STRING_LIMITS: Record<string, number> = {
  eventType: 80,
  dvSessionId: 120,
  dvVisitorId: 120,
  gclid: 255,
  gbraid: 255,
  wbraid: 255,
  utmSource: 120,
  utmMedium: 120,
  utmCampaign: 255,
  utmAdgroup: 255,
  utmTerm: 255,
  utmMatchtype: 80,
  utmDevice: 80,
  utmNetwork: 80,
  utmCreative: 255,
  pageUrl: 1200,
  pagePath: 255,
  landingPage: 1200,
  referrer: 1200,
  sourceLabel: 255,
  consentMarketing: 40,
  consentAnalytics: 40,
  userAgent: 600,
};

export type AdsTouchpointInput = {
  eventType?: unknown;
  occurredAt?: unknown;
  dvSessionId?: unknown;
  dvVisitorId?: unknown;
  gclid?: unknown;
  gbraid?: unknown;
  wbraid?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  utmAdgroup?: unknown;
  utmTerm?: unknown;
  utmMatchtype?: unknown;
  utmDevice?: unknown;
  utmNetwork?: unknown;
  utmCreative?: unknown;
  pageUrl?: unknown;
  pagePath?: unknown;
  landingPage?: unknown;
  referrer?: unknown;
  sourceLabel?: unknown;
  consentMarketing?: unknown;
  consentAnalytics?: unknown;
};

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function parseDate(value: unknown): Date {
  if (typeof value !== "string") return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  const now = Date.now();
  const min = now - 1000 * 60 * 60 * 24 * 7;
  const max = now + 1000 * 60 * 10;
  if (parsed.getTime() < min || parsed.getTime() > max) return new Date();
  return parsed;
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function hashDedupe(parts: unknown[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex");
}

export function normalizeAdsTouchpoint(input: AdsTouchpointInput, requestMeta: { userAgent?: string | null; ip?: string | null }) {
  const eventType = cleanString(input.eventType, STRING_LIMITS.eventType);
  if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
    throw new Error("Ongeldig eventType");
  }

  const occurredAt = parseDate(input.occurredAt);
  const normalized = {
    eventType,
    occurredAt,
    dvSessionId: cleanString(input.dvSessionId, STRING_LIMITS.dvSessionId),
    dvVisitorId: cleanString(input.dvVisitorId, STRING_LIMITS.dvVisitorId),
    gclid: cleanString(input.gclid, STRING_LIMITS.gclid),
    gbraid: cleanString(input.gbraid, STRING_LIMITS.gbraid),
    wbraid: cleanString(input.wbraid, STRING_LIMITS.wbraid),
    utmSource: cleanString(input.utmSource, STRING_LIMITS.utmSource),
    utmMedium: cleanString(input.utmMedium, STRING_LIMITS.utmMedium),
    utmCampaign: cleanString(input.utmCampaign, STRING_LIMITS.utmCampaign),
    utmAdgroup: cleanString(input.utmAdgroup, STRING_LIMITS.utmAdgroup),
    utmTerm: cleanString(input.utmTerm, STRING_LIMITS.utmTerm),
    utmMatchtype: cleanString(input.utmMatchtype, STRING_LIMITS.utmMatchtype),
    utmDevice: cleanString(input.utmDevice, STRING_LIMITS.utmDevice),
    utmNetwork: cleanString(input.utmNetwork, STRING_LIMITS.utmNetwork),
    utmCreative: cleanString(input.utmCreative, STRING_LIMITS.utmCreative),
    pageUrl: cleanString(input.pageUrl, STRING_LIMITS.pageUrl),
    pagePath: cleanString(input.pagePath, STRING_LIMITS.pagePath),
    landingPage: cleanString(input.landingPage, STRING_LIMITS.landingPage),
    referrer: cleanString(input.referrer, STRING_LIMITS.referrer),
    sourceLabel: cleanString(input.sourceLabel, STRING_LIMITS.sourceLabel),
    consentMarketing: cleanString(input.consentMarketing, STRING_LIMITS.consentMarketing) || "unknown",
    consentAnalytics: cleanString(input.consentAnalytics, STRING_LIMITS.consentAnalytics) || "unknown",
    userAgent: cleanString(requestMeta.userAgent, STRING_LIMITS.userAgent),
    ipHash: hashIp(requestMeta.ip || null),
  };

  return {
    ...normalized,
    dedupeKey: hashDedupe([
      normalized.eventType,
      normalized.occurredAt.toISOString().slice(0, 19),
      normalized.dvSessionId,
      normalized.dvVisitorId,
      normalized.gclid,
      normalized.gbraid,
      normalized.wbraid,
      normalized.pagePath,
    ]),
  };
}

export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function formatAdsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function clickId(touchpoint: { gclid: string | null; gbraid: string | null; wbraid: string | null }) {
  return touchpoint.gclid || touchpoint.gbraid || touchpoint.wbraid || "";
}

export async function buildOfflineConversionExport(options: {
  from: Date;
  to: Date;
  conversionName?: string;
  conversionValue?: string;
  markExported?: boolean;
}) {
  const conversionName = options.conversionName || "Telefonisch verkoopgesprek";
  const conversionValue = options.conversionValue || "300";
  const batchId = `ads-${new Date().toISOString()}`;

  const touchpoints = await prisma.adsTouchpoint.findMany({
    where: {
      eventType: "phone_click",
      occurredAt: { gte: options.from, lte: options.to },
      exportedAt: null,
      OR: [{ gclid: { not: null } }, { gbraid: { not: null } }, { wbraid: { not: null } }],
    },
    orderBy: { occurredAt: "asc" },
  });

  const calls = await prisma.call.findMany({
    where: {
      direction: "inbound",
      status: "ended",
      reason: "completed",
      timestamp: {
        gte: options.from,
        lte: new Date(options.to.getTime() + 1000 * 60 * 60 * 2),
      },
    },
    orderBy: { timestamp: "asc" },
  });

  const usedCalls = new Set<string>();
  const exportRows: string[][] = [
    ["Parameters:TimeZone=Europe/Amsterdam", "", "", "", "", "", ""],
    ["Google Click ID", "Conversion Name", "Conversion Time", "Conversion Value", "Conversion Currency", "Ad User Data", "Ad Personalization"],
  ];
  const reviewRows: string[][] = [[
    "classification",
    "uploadable",
    "reason",
    "touchpoint_id",
    "event_time",
    "call_time",
    "minutes_after_phone_click",
    "google_click_id",
    "page_path",
    "source_label",
    "call_id",
    "mautic_contact",
    "project_linked",
  ]];
  const exportedTouchpointIds: string[] = [];

  for (const tp of touchpoints) {
    const match = calls.find((call) => {
      if (usedCalls.has(call.id)) return false;
      const diff = call.timestamp.getTime() - tp.occurredAt.getTime();
      return diff >= 0 && diff <= 1000 * 60 * 30;
    });

    if (!match) {
      reviewRows.push([
        "clickid_phoneclick_without_call",
        "no",
        "Click-id en telefoonklik gevonden, maar geen afgerond inkomend gesprek binnen 30 minuten",
        tp.id,
        formatAdsDate(tp.occurredAt),
        "",
        "",
        clickId(tp),
        tp.pagePath || "",
        tp.sourceLabel || "",
        "",
        "",
        "",
      ]);
      continue;
    }

    usedCalls.add(match.id);
    exportedTouchpointIds.push(tp.id);
    const minutes = Math.round((match.timestamp.getTime() - tp.occurredAt.getTime()) / 60000);
    exportRows.push([
      clickId(tp),
      conversionName,
      formatAdsDate(match.timestamp),
      conversionValue,
      "EUR",
      tp.consentMarketing === "granted" ? "Granted" : "Denied",
      tp.consentMarketing === "granted" ? "Granted" : "Denied",
    ]);
    reviewRows.push([
      "hard_clickid_phoneclick_call",
      "yes",
      "Click-id, telefoonklik en afgerond inkomend gesprek binnen 30 minuten",
      tp.id,
      formatAdsDate(tp.occurredAt),
      formatAdsDate(match.timestamp),
      String(minutes),
      clickId(tp),
      tp.pagePath || "",
      tp.sourceLabel || "",
      match.id,
      match.mauticContactId ? "yes" : "no",
      match.projectId ? "yes" : "no",
    ]);
  }

  if (options.markExported && exportedTouchpointIds.length) {
    await prisma.adsTouchpoint.updateMany({
      where: { id: { in: exportedTouchpointIds } },
      data: { exportedAt: new Date(), exportBatchId: batchId },
    });
  }

  return {
    batchId,
    uploadableRows: exportRows.length - 2,
    reviewedRows: reviewRows.length - 1,
    importCsv: exportRows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
    reviewCsv: reviewRows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
  };
}
