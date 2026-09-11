import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { searchContacts } from "@/lib/mautic";
import { phone, email } from "@/lib/hypotheek/rules";
export async function GET(req: NextRequest) {
    if (!await isAuthorized(req))
        return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    const q = (req.nextUrl.searchParams.get("search") || "").trim();
    if (q.length < 2)
        return NextResponse.json({ contacten: [] });
    const [leads, remote] = await Promise.all([prisma.lead.findMany({ include: { doorverwijzingDeelnames: true } }), searchContacts({ search: q, limit: 100 }).catch(() => null)]);
    const matching = leads.filter(l => [l.naam, l.email, l.telefoon].some(v => v?.toLowerCase().includes(q.toLowerCase())) || (phone(q) && phone(l.telefoon) === phone(q)));
    const contacts = matching.map(l => ({ leadId: l.id, mauticContactId: l.mauticContactId, naam: l.naam, email: l.email, telefoon: l.telefoon, bron: "Platform", koppelingen: l.doorverwijzingDeelnames }));
    for (const c of remote?.contacts || []) {
        if (![c.firstname, c.lastname, c.email, c.phone, c.mobile].some(v => v?.toLowerCase().includes(q.toLowerCase())) && !(phone(q) && [c.phone, c.mobile].some(v => phone(v) === phone(q))))
            continue;
        const existing = leads.find(l => l.mauticContactId === String(c.id) || (email(c.email) && email(l.email) === email(c.email)));
        if (existing) {
            if (!contacts.some(x => x.leadId === existing.id))
                contacts.push({ leadId: existing.id, mauticContactId: existing.mauticContactId, naam: existing.naam, email: existing.email, telefoon: existing.telefoon, bron: "Platform", koppelingen: existing.doorverwijzingDeelnames });
            continue;
        }
        contacts.push({ leadId: "", mauticContactId: String(c.id), naam: [c.firstname, c.lastname].filter(Boolean).join(" "), email: c.email, telefoon: c.mobile || c.phone, bron: "Mautic", koppelingen: [] });
    }
    return NextResponse.json({ contacten: contacts.slice(0, 30), warning: remote ? null : "Mautic is niet bereikbaar. Alleen platformcontacten getoond." });
}
