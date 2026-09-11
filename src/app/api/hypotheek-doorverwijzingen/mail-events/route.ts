import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { failure } from "@/lib/hypotheek/http";
import { processMail } from "@/lib/hypotheek/mail";
export async function POST(req: NextRequest) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    try {
        return NextResponse.json(await processMail(await req.json()));
    }
    catch (e) {
        return failure(e);
    }
}
export async function GET(req: NextRequest) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const where = { status: "review" };
    const [events, total] = await prisma.$transaction([prisma.hypotheekMailEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 25, skip: (page - 1) * 25 }), prisma.hypotheekMailEvent.count({ where })]);
    return NextResponse.json({ events, pagination: { page, pages: Math.ceil(total / 25), total } });
}
