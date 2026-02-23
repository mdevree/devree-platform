import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

const N8N_WEBHOOK_URL = "https://automation.devreemakelaardij.nl/webhook/buurtdata";

export async function POST(request: NextRequest) {
  const authorized = await isAuthorized(request);
  if (!authorized) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const { postcode, huisnummer, huisletter, huisnummer_toevoeging } = body;

  if (!postcode || !huisnummer) {
    return NextResponse.json(
      { error: "Postcode en huisnummer zijn verplicht" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postcode: postcode.replace(/\s/g, "").toUpperCase(),
        huisnummer: parseInt(String(huisnummer), 10),
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

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Verzoek timed out na 30 seconden" }, { status: 504 });
    }
    return NextResponse.json({ error: "Onverwachte fout bij ophalen data" }, { status: 500 });
  }
}
