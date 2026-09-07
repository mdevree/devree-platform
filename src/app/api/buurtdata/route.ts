import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { fetchFriduRadarContext } from "@/lib/friduRadar";

const N8N_WEBHOOK_URL = "https://automation.devreemakelaardij.nl/webhook/buurtdata";
const BUURTDATA_TIMEOUT_MS = 240_000;

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
  const timeout = setTimeout(() => controller.abort(), BUURTDATA_TIMEOUT_MS);

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

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fout bij ophalen buurtdata (${res.status})` },
        { status: res.status }
      );
    }

    const data = await res.json();
    clearTimeout(timeout);
    const normalizedData = Array.isArray(data) ? data[0] : data;
    const radar = await fetchFriduRadarContext({
      postcode: postcode.replace(/\s/g, "").toUpperCase(),
      huisnummer: parseInt(String(huisnummer), 10),
      huisletter: huisletter || null,
      huisnummer_toevoeging: huisnummer_toevoeging || null,
    });
    if (normalizedData && typeof normalizedData === "object") {
      return NextResponse.json({ ...normalizedData, radar });
    }
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Het ophalen van buurtdata duurt langer dan 4 minuten. Probeer het opnieuw." }, { status: 504 });
    }
    return NextResponse.json({ error: "Onverwachte fout bij ophalen data" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
