import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { actor, failure } from "@/lib/hypotheek/http";
import { correct, detailInclude } from "@/lib/hypotheek/service";
type Ctx = {
    params: Promise<{
        id: string;
    }>;
};
export async function GET(req: NextRequest, ctx: Ctx) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const { id } = await ctx.params;
    const doorverwijzing = await prisma.hypotheekDoorverwijzing.findUnique({ where: { id }, include: detailInclude });
    return NextResponse.json({ doorverwijzing }, { status: doorverwijzing ? 200 : 404 });
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    try {
        return NextResponse.json({ doorverwijzing: await correct((await ctx.params).id, await req.json(), await actor()) });
    }
    catch (e) {
        return failure(e);
    }
}
