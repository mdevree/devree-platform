import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { failure } from "@/lib/hypotheek/http";
import { locked } from "@/lib/hypotheek/service";
import { addresses } from "@/lib/hypotheek/rules";
export async function GET(req: NextRequest) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    return NextResponse.json(await prisma.hypotheekInstelling.findUniqueOrThrow({ where: { id: "default" } }));
}
export async function PATCH(req: NextRequest) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const d = await req.json();
    if (typeof d.automatisch !== "boolean")
        return NextResponse.json({ error: "Kies aan of uit." }, { status: 400 });
    try {
        return NextResponse.json(await locked(async (tx) => {
            const old = await tx.hypotheekInstelling.findUniqueOrThrow({ where: { id: "default" } });
            return tx.hypotheekInstelling.update({ where: { id: "default" }, data: { automatisch: d.automatisch, ...(d.automatisch && !old.automatisch ? { actiefVanaf: new Date() } : {}), ...(d.afzenders ? { afzenders: addresses(d.afzenders) } : {}) } });
        }));
    }
    catch (e) {
        return failure(e);
    }
}
