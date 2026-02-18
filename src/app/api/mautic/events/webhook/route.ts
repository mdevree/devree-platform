import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/mautic/events/webhook
 * Ontvangt Mautic webhook events (email clicks, opens, page hits, etc.)
 *
 * Mautic stuurt een batch payload:
 * {
 *   "mautic.email_on_click": [{ contact: { id }, email: { id, name }, hit: { url, ip, userAgent }, timestamp }],
 *   "mautic.email_on_open": [{ ... }],
 *   ...
 * }
 *
 * Auth: x-mautic-webhook-secret header of x-webhook-secret header
 */
export async function POST(request: NextRequest) {
  // Webhook authenticatie
  const webhookSecret = request.headers.get("x-mautic-webhook-secret")
    || request.headers.get("x-webhook-secret");

  const expectedSecret = process.env.MAUTIC_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET;
  if (expectedSecret && webhookSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown[]>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON payload" }, { status: 400 });
  }

  const eventTypeMap: Record<string, string> = {
    "mautic.email_on_click": "email.click",
    "mautic.email_on_open": "email.open",
    "mautic.page_on_hit": "page.hit",
    "mautic.form_on_submit": "form.submit",
    "mautic.email_on_send": "email.send",
  };

  let processed = 0;
  const errors: string[] = [];

  for (const [mauticEventType, events] of Object.entries(payload)) {
    const eventType = eventTypeMap[mauticEventType] || mauticEventType;
    if (!Array.isArray(events)) continue;

    for (const event of events) {
      try {
        const e = event as Record<string, unknown>;
        const contact = e.contact as Record<string, unknown> | undefined;
        const email = e.email as Record<string, unknown> | undefined;
        const hit = e.hit as Record<string, unknown> | undefined;
        const timestamp = e.timestamp as string | undefined;

        if (!contact?.id) continue;

        const mauticContactId = parseInt(String(contact.id));
        const occurredAt = timestamp ? new Date(timestamp) : new Date();

        await prisma.mauticEvent.create({
          data: {
            mauticContactId,
            eventType,
            emailName: (email?.name as string) || null,
            emailId: email?.id ? parseInt(String(email.id)) : null,
            clickedUrl: (hit?.url as string) || null,
            ipAddress: (hit?.ip as string) || null,
            occurredAt,
            rawPayload: e as object,
          },
        });

        processed++;
      } catch (err) {
        errors.push(`Event fout: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
