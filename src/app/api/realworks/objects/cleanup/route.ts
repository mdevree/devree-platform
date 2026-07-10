import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { cleanupExpiredMarketObjects } from "@/lib/marketObjects";

function limitFromBody(body: unknown) {
  const value =
    body && typeof body === "object" && "limit" in body
      ? Number((body as Record<string, unknown>).limit)
      : 250;
  return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 1000)) : 250;
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = await cleanupExpiredMarketObjects(limitFromBody(body));
  return NextResponse.json({ success: true, ...result });
}
