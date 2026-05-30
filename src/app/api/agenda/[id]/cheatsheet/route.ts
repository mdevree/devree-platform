import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/agenda/[id]/cheatsheet
 *
 * Triggert de cheat-sheet-flow: stuurt een webhook naar n8n, dat via
 * GET /api/agenda/[id]/context de voorbereidings-PDF rendert, in Nextcloud
 * opslaat en (na de afspraak) de geannoteerde versie via OCR terugverwerkt.
 *
 * Niet-blokkerend patroon zoals CALL_NOTE_WEBHOOK_URL: een ontbrekende of
 * mislukte webhook levert een duidelijke status, geen harde 500.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }

  const webhookUrl = process.env.CHEATSHEET_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "CHEATSHEET_WEBHOOK_URL niet geconfigureerd" },
      { status: 503 }
    );
  }

  // Absolute URL naar het context-endpoint dat n8n ophaalt om de PDF te renderen.
  const base =
    process.env.PLATFORM_BASE_URL || req.nextUrl.origin;
  const contextUrl = `${base}/api/agenda/${id}/context`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        afspraakId: id,
        systemid: afspraak.systemid,
        mauticContactId: afspraak.mauticContactId,
        contactNaam: afspraak.contactNaam,
        agbegin: afspraak.agbegin,
        contextUrl,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n weigerde de aanvraag: ${res.status}` },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("Cheat-sheet webhook fout:", err);
    return NextResponse.json(
      { error: "Kon n8n niet bereiken voor cheat-sheet" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, afspraakId: id });
}
