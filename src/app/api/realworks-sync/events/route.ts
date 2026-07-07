import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { jsonValue, normalizeSyncPayload, type RealworksSyncPayload } from "@/lib/realworksSync";

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

  const body = await request.json() as RealworksSyncPayload & { status?: string };
  const normalized = normalizeSyncPayload(body);
  const status = ["processed", "ignored", "quarantined", "failed", "duplicate"].includes(String(body.status))
    ? String(body.status)
    : "processed";

  const existing = await prisma.realworksSyncEvent.findUnique({
    where: { payloadHash: normalized.payloadHash },
    select: { id: true, status: true, createdAt: true },
  });
  if (existing) {
    return NextResponse.json({ success: true, duplicate: true, event: existing }, { headers: CORS_HEADERS });
  }

  try {
    const event = await prisma.realworksSyncEvent.create({
      data: {
        eventType: normalized.eventType,
        status,
        ignoredReason: body.ignoredReason ?? null,
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
        matchStrategy: normalized.matchStrategy,
        matchConfidence: normalized.matchConfidence,
        payload: jsonValue(normalized.payload),
        capturedAt: normalized.capturedAt,
      },
    });
    return NextResponse.json({ success: true, duplicate: false, event }, { status: 201, headers: CORS_HEADERS });
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
  const status = searchParams.get("status") || undefined;
  const eventType = searchParams.get("eventType") || undefined;

  const events = await prisma.realworksSyncEvent.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(searchParams.get("limit") || 50), 200),
  });

  return NextResponse.json({ events }, { headers: CORS_HEADERS });
}
