import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

export const REALWORKS_SYNC_PAYLOAD_VERSION = "2026-07-07";

export type RealworksSyncPayload = {
  eventType?: string;
  source?: string;
  sourceUrl?: string;
  realworksPath?: string;
  method?: string;
  systemid?: string | number | null;
  rcode?: string | number | null;
  email?: string | null;
  payloadVersion?: string;
  extensionVersion?: string;
  payloadHash?: string;
  matchStrategy?: string;
  matchConfidence?: number;
  capturedAt?: string;
  payload?: unknown;
  data?: Record<string, unknown>;
  ignoredReason?: string;
  reason?: string;
  severity?: string;
};

export function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function isCompleteEmail(value: unknown): boolean {
  const email = stringValue(value)?.toLowerCase();
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

export function payloadHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

export function normalizeSyncPayload(input: RealworksSyncPayload) {
  const data = input.data ?? {};
  const email = stringValue(input.email ?? data.email)?.toLowerCase() ?? null;
  const eventType = stringValue(input.eventType) ?? "unknown";
  const hashInput = {
    eventType,
    sourceUrl: input.sourceUrl,
    realworksPath: input.realworksPath,
    systemid: input.systemid ?? data._systemid ?? data.systemid,
    rcode: input.rcode ?? data.rcode ?? data.agrcode,
    email,
    payloadVersion: input.payloadVersion,
    payload: input.payload ?? data,
  };

  return {
    eventType,
    source: stringValue(input.source),
    sourceUrl: stringValue(input.sourceUrl),
    realworksPath: stringValue(input.realworksPath),
    method: stringValue(input.method),
    systemid: stringValue(input.systemid ?? data._systemid ?? data.systemid),
    rcode: stringValue(input.rcode ?? data.rcode ?? data.agrcode),
    email,
    payloadVersion: stringValue(input.payloadVersion),
    extensionVersion: stringValue(input.extensionVersion),
    payloadHash: stringValue(input.payloadHash) ?? payloadHash(hashInput),
    matchStrategy: stringValue(input.matchStrategy),
    matchConfidence: typeof input.matchConfidence === "number" ? input.matchConfidence : null,
    capturedAt: parseDate(input.capturedAt),
    payload: input.payload ?? data,
  };
}

export function validateRealworksContactPayload(input: RealworksSyncPayload): string[] {
  const data = input.data ?? {};
  const email = input.email ?? data.email;
  const systemid = input.systemid ?? data._systemid ?? data.systemid;
  const rcode = input.rcode ?? data.rcode ?? data.agrcode;
  const path = stringValue(input.realworksPath) ?? "";
  const eventType = stringValue(input.eventType) ?? "";
  const reasons: string[] = [];

  if (eventType === "contact.save") {
    if (!path.includes("/rela.person/save")) reasons.push("contact.save kwam niet van /rela.person/save");
    if (!isCompleteEmail(email)) reasons.push("contactpayload heeft geen compleet e-mailadres");
    if (!stringValue(systemid) && !stringValue(rcode) && !isCompleteEmail(email)) {
      reasons.push("contactpayload heeft geen betrouwbare sleutel");
    }
  }

  const woningAdres = stringValue((data as Record<string, unknown>).woning_adres);
  if (woningAdres === "," || woningAdres === " ,") {
    reasons.push("woning_adres bevat alleen een komma");
  }

  return reasons;
}
