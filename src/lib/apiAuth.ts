import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Controleer of een request geautoriseerd is via:
 * 1. Een geldige NextAuth sessie (cookie)
 * 2. De x-webhook-secret header (voor server-to-server aanroepen)
 *
 * Gebruik:
 *   const authorized = await isAuthorized(request);
 *   if (!authorized) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
 */
export async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Optie 1: webhook secret header
  const webhookSecret = request.headers.get("x-webhook-secret");
  if (process.env.N8N_WEBHOOK_SECRET && webhookSecret === process.env.N8N_WEBHOOK_SECRET) {
    return true;
  }

  // Optie 2: actieve sessie
  const session = await auth();
  return !!session;
}
