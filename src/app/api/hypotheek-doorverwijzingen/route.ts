import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { actor, failure } from "@/lib/hypotheek/http";
import { register } from "@/lib/hypotheek/service";
export async function POST(req: NextRequest) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    try {
        const data = await req.json();
        const result = await register({ adviseurId: data.adviseurId, contacten: data.contacten, datum: data.datum, notities: data.notities, herkomst: "handmatig" }, await actor());
        return NextResponse.json(result, { status: result.existing ? 200 : 201 });
    }
    catch (e) {
        return failure(e);
    }
}
