import { NextRequest, NextResponse } from "next/server";
import { processWahaReplyEvent } from "@/lib/whatsappReplies";
import {
  getWahaReplyEvent,
  isWhatsAppReplyEnabled,
  validPersonalWahaSignature,
} from "@/lib/whatsappReplyEvents";

export async function POST(req: NextRequest) {
  const key = process.env.WAHA_PERSONAL_WEBHOOK_HMAC_KEY;
  const session = process.env.WAHA_PERSONAL_SESSION;
  if (!isWhatsAppReplyEnabled("personal") || !key || !session) {
    return NextResponse.json({ error: "Route niet beschikbaar" }, { status: 404 });
  }
  const raw = await req.text();
  if (!validPersonalWahaSignature(raw, req.headers.get("x-webhook-hmac"), key)) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Ongeldig bericht" }, { status: 400 });
  }
  const event = getWahaReplyEvent(payload);
  if (!event || event.session !== session) return NextResponse.json({ ok: true });

  try {
    await processWahaReplyEvent("personal", event);
  } catch {
    // No account identifiers or message content in server/webhook diagnostics.
    console.error("Persoonlijke WhatsApp webhook tijdelijk niet verwerkt");
    return NextResponse.json({ error: "Tijdelijk niet verwerkt" }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
