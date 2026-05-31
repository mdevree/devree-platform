import { NextRequest, NextResponse } from "next/server";
import { upsertBuurtdataLead } from "@/lib/mautic";

const N8N_WEBHOOK_URL = "https://automation.devreemakelaardij.nl/webhook/buurtdata";

const POSTCODE_REGEX = /^[1-9][0-9]{3}[A-Z]{2}$/;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldig verzoek" }, { status: 400 });
  }

  const { postcode, huisnummer, huisletter, huisnummer_toevoeging, naam, email, telefoon } = body as Record<string, string>;

  // Validatie
  if (!postcode || !huisnummer) {
    return NextResponse.json({ error: "Postcode en huisnummer zijn verplicht" }, { status: 400 });
  }

  const postcodeNorm = String(postcode).replace(/\s/g, "").toUpperCase();
  if (!POSTCODE_REGEX.test(postcodeNorm)) {
    return NextResponse.json({ error: "Ongeldige postcode (bijv. 1234AB)" }, { status: 400 });
  }

  const huisnummerInt = parseInt(String(huisnummer), 10);
  if (isNaN(huisnummerInt) || huisnummerInt < 1) {
    return NextResponse.json({ error: "Ongeldig huisnummer" }, { status: 400 });
  }

  if (!naam || String(naam).trim().length < 2) {
    return NextResponse.json({ error: "Naam is verplicht" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return NextResponse.json({ error: "Geldig e-mailadres is verplicht" }, { status: 400 });
  }

  // Buurtdata ophalen via n8n
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let buurtdata: unknown;
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: postcodeNorm,
        huisnummer: huisnummerInt,
        huisnummer_toevoeging: huisnummer_toevoeging || null,
        huisletter: huisletter || null,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fout bij ophalen buurtdata (${res.status})` },
        { status: res.status }
      );
    }

    const json = await res.json();
    buurtdata = Array.isArray(json) ? json[0] : json;

    if (!buurtdata) {
      return NextResponse.json({ error: "Geen data ontvangen voor dit adres" }, { status: 404 });
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Verzoek timed out na 30 seconden" }, { status: 504 });
    }
    return NextResponse.json({ error: "Fout bij ophalen buurtdata" }, { status: 500 });
  }

  // Mautic lead aanmaken (niet-blokkerend: fout verbreekt de response niet)
  const volledigAdres =
    (buurtdata as { adres?: { volledig?: string } }).adres?.volledig ||
    `${postcodeNorm} ${huisnummerInt}`;

  try {
    await upsertBuurtdataLead({
      naam: String(naam).trim(),
      email: String(email).trim().toLowerCase(),
      telefoon: telefoon ? String(telefoon).trim() : null,
      adres: volledigAdres,
    });
  } catch (err) {
    console.error("Mautic lead aanmaken mislukt:", err);
  }

  return NextResponse.json(buurtdata);
}
