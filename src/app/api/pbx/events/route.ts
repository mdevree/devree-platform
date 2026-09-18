import { NextResponse } from "next/server";
import { pbxServiceAuthorized } from "@/lib/pbx/auth";
import { parsePbxEvent } from "@/lib/pbx/core";
import { receivePbxEvent } from "@/lib/pbx/store";
export async function POST(req: Request) {
  if (!pbxServiceAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length")) > 10000) return new Response(null, { status: 413 });
  const text = await req.text();
  if (text.length > 10000) return new Response(null, { status: 413 });
  let event;
  try { event = parsePbxEvent(JSON.parse(text)); } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
  try {
    const row = await receivePbxEvent(event);
    return NextResponse.json({ stored: true, requestId: row?.id });
  } catch (e) { console.error("PBX event kon niet worden opgeslagen", e instanceof Error ? e.name : "error"); return NextResponse.json({ error: "Opslaan mislukt; gebeurtenis opnieuw aanbieden" }, { status: 503 }); }
}
