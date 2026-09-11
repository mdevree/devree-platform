import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { locked, ReferralError } from "@/lib/hypotheek/service";
import { addresses } from "@/lib/hypotheek/rules";
import { failure } from "@/lib/hypotheek/http";
type Ctx = {
    params: Promise<{
        id: string;
    }>;
};
export async function GET(req: NextRequest, ctx: Ctx) { if (!await isAuthorized(req))
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 }); return NextResponse.json({ adressen: await prisma.hypotheekAdviseurEmail.findMany({ where: { adviseurId: (await ctx.params).id } }) }); }
export async function PUT(req: NextRequest, ctx: Ctx) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const { id } = await ctx.params;
    const data = await req.json();
    const emails = addresses(data.adressen);
    try {
        return NextResponse.json(await locked(async (tx) => {
            const partner = await tx.hypotheekAdviseur.findUnique({ where: { id } });
            if (!partner)
                throw new ReferralError("Adviseur niet gevonden.", 404);
            const clash = await tx.hypotheekAdviseurEmail.findFirst({ where: { email: { in: emails }, adviseurId: { not: id } } });
            if (clash)
                throw new ReferralError("Een adres hoort al bij een andere adviseur.", 409);
            await tx.hypotheekAdviseurEmail.deleteMany({ where: { adviseurId: id } });
            await tx.hypotheekAdviseurEmail.createMany({ data: emails.map(email => ({ email, adviseurId: id })) });
            return { success: true };
        }));
    }
    catch (e) {
        return failure(e);
    }
}
