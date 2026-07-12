import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

const CHECK_TIMEOUT_MS = 3500;

function resolveHealthUrl() {
  const raw = process.env.PBX_BRIDGE_HEALTH_URL?.trim();
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function safeTarget(url: URL | null) {
  if (!url) return null;
  return `${url.protocol}//${url.host}${url.pathname}`;
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const healthUrl = resolveHealthUrl();
  const checkedAt = new Date().toISOString();

  if (!healthUrl) {
    return NextResponse.json({
      health: "attention",
      configured: false,
      checkedAt,
      target: null,
      error: "PBX_BRIDGE_HEALTH_URL is niet geconfigureerd",
    });
  }

  const controller = new AbortController();
  const started = Date.now();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - started;
    const body = await response.json().catch(() => ({}));
    const ok = response.ok && body?.ok !== false;

    return NextResponse.json({
      health: ok ? "ok" : "attention",
      configured: true,
      checkedAt,
      target: safeTarget(healthUrl),
      statusCode: response.status,
      responseTimeMs,
      context: typeof body?.context === "string" ? body.context : null,
      error: ok ? null : "PBX bridge gaf geen gezonde status terug",
    });
  } catch (err) {
    const responseTimeMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";

    return NextResponse.json({
      health: "attention",
      configured: true,
      checkedAt,
      target: safeTarget(healthUrl),
      responseTimeMs,
      context: null,
      error: aborted ? "PBX bridge healthcheck timeout" : err instanceof Error ? err.message : "Onbekende PBX healthcheck fout",
    });
  } finally {
    clearTimeout(timeout);
  }
}
