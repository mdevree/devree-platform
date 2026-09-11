import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ReferralError } from "./service";
export async function actor() { const s = await auth(); return s?.user?.email || "server"; }
export function failure(error: unknown) {
    if (error instanceof ReferralError)
        return NextResponse.json({ error: error.message, existingId: error.existingId }, { status: error.status });
    if (error instanceof Error && /datum/i.test(error.message))
        return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Hypotheekdoorverwijzing mislukt", error instanceof Error ? error.message : "onbekend");
    return NextResponse.json({ error: "Opslaan is niet gelukt. Probeer opnieuw; er is geen gedeeltelijke registratie opgeslagen." }, { status: 500 });
}
