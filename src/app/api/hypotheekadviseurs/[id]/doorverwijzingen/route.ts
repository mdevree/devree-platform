import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { detailInclude } from "@/lib/hypotheek/service";
import { periodFilter } from "@/lib/hypotheek/rules";
export async function GET(req: NextRequest, ctx: {
    params: Promise<{
        id: string;
    }>;
}) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const p = req.nextUrl.searchParams;
    const page = Math.max(1, Number(p.get("page")) || 1);
    const search = (p.get("search") || "").trim();
    const datum = periodFilter(p.get("periode"));
    const where = { adviseurId: (await ctx.params).id, ...(datum ? { datum } : {}), ...(search ? { deelnemers: { some: { lead: { OR: [{ naam: { contains: search } }, { email: { contains: search } }, { telefoon: { contains: search } }] } } } } : {}) };
    const [doorverwijzingen, total] = await prisma.$transaction([prisma.hypotheekDoorverwijzing.findMany({ where, include: detailInclude, orderBy: [{ datum: "desc" }, { createdAt: "desc" }], skip: (page - 1) * 25, take: 25 }), prisma.hypotheekDoorverwijzing.count({ where })]);
    return NextResponse.json({ doorverwijzingen, pagination: { page, total, pages: Math.ceil(total / 25), limit: 25 } });
}
