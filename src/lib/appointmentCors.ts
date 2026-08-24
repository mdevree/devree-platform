import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  "https://www.devreemakelaardij.nl",
  "https://devreemakelaardij.nl",
]);

export function appointmentCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function appointmentCorsOptions(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: appointmentCorsHeaders(request),
  });
}
