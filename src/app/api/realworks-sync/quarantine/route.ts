import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import {
  jsonValue,
  normalizeSyncPayload,
  validateRealworksContactPayload,
  type RealworksSyncPayload,
} from "@/lib/realworksSync";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await request.json() as RealworksSyncPayload;
  const normalized = normalizeSyncPayload(body);
  const validationReasons = validateRealworksContactPayload(body);
  const reason = body.reason || validationReasons.join("; ") || "Payload door extensie in quarantaine geplaatst";
  const severity = ["info", "warning", "critical"].includes(String(body.severity))
    ? String(body.severity)
    : validationReasons.length ? "warning" : "info";

  const existing = await prisma.realworksSyncQuarantine.findUnique({
    where: { payloadHash: normalized.payloadHash },
  });
  if (existing) {
    return NextResponse.json({ success: true, duplicate: true, item: existing }, { headers: CORS_HEADERS });
  }

  try {
    const item = await prisma.realworksSyncQuarantine.create({
      data: {
        reason,
        severity,
        eventType: normalized.eventType,
        source: normalized.source,
        sourceUrl: normalized.sourceUrl,
        realworksPath: normalized.realworksPath,
        method: normalized.method,
        systemid: normalized.systemid,
        rcode: normalized.rcode,
        email: normalized.email,
        payloadVersion: normalized.payloadVersion,
        extensionVersion: normalized.extensionVersion,
        payloadHash: normalized.payloadHash,
        payload: jsonValue(normalized.payload),
      },
    });

    await prisma.realworksSyncEvent.create({
      data: {
        eventType: normalized.eventType,
        status: "quarantined",
        ignoredReason: reason,
        source: normalized.source,
        sourceUrl: normalized.sourceUrl,
        realworksPath: normalized.realworksPath,
        method: normalized.method,
        systemid: normalized.systemid,
        rcode: normalized.rcode,
        email: normalized.email,
        payloadVersion: normalized.payloadVersion,
        extensionVersion: normalized.extensionVersion,
        payloadHash: `${normalized.payloadHash}:quarantine`,
        payload: jsonValue(normalized.payload),
        capturedAt: normalized.capturedAt,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, duplicate: false, item }, { status: 201, headers: CORS_HEADERS });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: true, duplicate: true }, { headers: CORS_HEADERS });
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "open";
  const items = await prisma.realworksSyncQuarantine.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(searchParams.get("limit") || 50), 200),
  });

  return NextResponse.json({ items }, { headers: CORS_HEADERS });
}
