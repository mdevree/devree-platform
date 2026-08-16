import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getClientIp, normalizeAdsTouchpoint } from "@/lib/adsAttribution";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGINS = new Set([
  "https://www.devreemakelaardij.nl",
  "https://devreemakelaardij.nl",
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.devreemakelaardij.nl";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: "Origin niet toegestaan" }, { status: 403, headers });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig JSON-verzoek" }, { status: 400, headers });
  }

  let normalized: ReturnType<typeof normalizeAdsTouchpoint>;
  try {
    normalized = normalizeAdsTouchpoint(body, {
      userAgent: request.headers.get("user-agent"),
      ip: getClientIp(request.headers),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ongeldig touchpoint" },
      { status: 400, headers }
    );
  }

  try {
    const touchpoint = await prisma.adsTouchpoint.create({ data: normalized });
    return NextResponse.json({ success: true, duplicate: false, id: touchpoint.id }, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: true, duplicate: true }, { headers });
    }
    console.error("[ads-touchpoints] opslaan mislukt", error);
    return NextResponse.json({ error: "Opslaan mislukt" }, { status: 500, headers });
  }
}
