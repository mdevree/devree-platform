import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { failure } from "@/lib/hypotheek/http";
import { actor } from "@/lib/hypotheek/http";
import { locked, registerInTransaction, ReferralError } from "@/lib/hypotheek/service";
export async function PATCH(req: NextRequest, ctx: {
    params: Promise<{
        id: string;
    }>;
}) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const { id } = await ctx.params;
    const data = await req.json();
    const user = await actor();
    try {
        return NextResponse.json(await locked(async (tx) => {
            const event = await tx.hypotheekMailEvent.findUnique({ where: { id } });
            if (!event)
                throw new ReferralError("Mail niet gevonden.", 404);
            if (event.status !== "review")
                return { event };
            if (data.action === "ignore")
                return { event: await tx.hypotheekMailEvent.update({ where: { id }, data: { status: "ignored", reden: `Afgehandeld door ${user}: geen doorverwijzing.` } }) };
            if (data.action !== "register")
                throw new ReferralError("Ongeldige actie.");
            return registerInTransaction(tx, { ...data, herkomst: "email_review", mailEventId: id }, user);
        }));
    }
    catch (e) {
        return failure(e);
    }
}
