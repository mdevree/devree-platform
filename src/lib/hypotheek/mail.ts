import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchContacts } from "@/lib/mautic";
import { addresses, classify, day, dutchDay, email, phone } from "./rules";
import { ContactInput, locked, registerInTransaction, ReferralError } from "./service";
export type MailPayload = {
    messageId: string;
    mailbox: string;
    sentAt: string;
    from: string;
    to: string | string[];
    cc?: string | string[];
    subject?: string;
    textPlain?: string;
    textHtml?: string;
    dryRun?: boolean;
    historical?: boolean;
};
export async function processMail(p: MailPayload, search = searchContacts) {
    if (!p.messageId || !p.mailbox || p.messageId.length > 191 || p.mailbox.length > 191)
        throw new ReferralError("Message-ID en mailbox zijn verplicht (maximaal 191 tekens).");
    const existing = await prisma.hypotheekMailEvent.findUnique({ where: { messageId_mailbox: { messageId: p.messageId, mailbox: email(p.mailbox) } } });
    if (existing)
        return { event: existing, duplicate: true };
    const setting = await prisma.hypotheekInstelling.findUniqueOrThrow({ where: { id: "default" } });
    const allowed = Array.isArray(setting.afzenders) ? setting.afzenders.filter((x): x is string => typeof x === "string") : [];
    const sender = addresses(p.from);
    const recipients = addresses([p.to, p.cc]);
    const rules = classify((p.textPlain || p.textHtml || "").slice(0, 100000), p.subject || "");
    if (sender.length !== 1 || !allowed.includes(sender[0]) || !rules.referral)
        return { status: "ignored", reden: "Geen uitgaande hypotheekdoorverwijzing." };
    const partners = await prisma.hypotheekAdviseur.findMany({ where: { actief: true }, include: { emailAdressen: true } });
    const matches = partners.filter(a => [email(a.email), ...a.emailAdressen.map(e => e.email)].some(e => recipients.includes(e)));
    if (!matches.length)
        return { status: "ignored", reden: "Geen bekende hypotheekpartner als ontvanger." };
    const sentAt = new Date(p.sentAt);
    const validDate = Number.isFinite(sentAt.getTime());
    let reden = matches.length !== 1 ? "Meerdere hypotheekpartners ontvangen deze mail." : !validDate ? "Oorspronkelijke verzenddatum ontbreekt." : rules.household ? "Gezamenlijke verwijzing: controleer de betrokkenen." : "";
    const allLeads = await prisma.lead.findMany();
    const contactMap = new Map<string, ContactInput>();
    const identifiers = [...rules.emails.filter(e => !e.endsWith("@devreemakelaardij.nl") && !partners.some(a => [email(a.email), ...a.emailAdressen.map(x => x.email)].includes(e))), ...rules.phones];
    for (const identifier of identifiers) {
        const isEmail = identifier.includes("@");
        const local = allLeads.filter(l => isEmail ? email(l.email) === identifier : phone(l.telefoon) === identifier);
        let remote: Awaited<ReturnType<typeof searchContacts>> = { contacts: [], total: 0 };
        try { remote = await search({ search: isEmail ? identifier : (identifier.startsWith("31") ? "0" + identifier.slice(2) : identifier), limit: 100, strict: true }); }
        catch { reden = "Contactcontrole tijdelijk niet beschikbaar; controleer handmatig."; }
        if (remote.total > 100)
            reden = "Te veel mogelijke contacten; controleer handmatig.";
        const exact = remote.contacts.filter(c => isEmail ? email(c.email) === identifier : [c.phone, c.mobile].some(v => phone(v) === identifier));
        if (!local.length && !exact.length) reden = "Niet alle genoemde contactgegevens konden worden bevestigd.";
        for (const l of local)
            contactMap.set(l.id, { leadId: l.id, naam: l.naam, mauticContactId: l.mauticContactId || undefined, email: l.email, telefoon: l.telefoon });
        for (const c of exact) {
            const linked = allLeads.filter(l => l.mauticContactId === String(c.id) || (email(c.email) && email(l.email) === email(c.email)));
            if (linked.length > 1)
                reden = "Meerdere platformcontacten matchen hetzelfde Mautic-contact.";
            for (const l of linked)
                contactMap.set(l.id, { leadId: l.id, mauticContactId: l.mauticContactId || String(c.id), naam: l.naam, email: l.email, telefoon: l.telefoon });
            if (!linked.length)
                contactMap.set(`mautic_${c.id}`, { mauticContactId: String(c.id), naam: [c.firstname, c.lastname].filter(Boolean).join(" "), email: c.email, telefoon: c.mobile || c.phone });
        }
    }
    const candidates = [...contactMap.values()];
    if (candidates.length !== 1)
        reden = candidates.length ? "Meerdere mogelijke contacten; kies de juiste persoon of het gezin." : "Geen eenduidig bestaand contact met e-mail of telefoon gevonden.";
    const candidate = candidates.length === 1 ? candidates[0] : null;
    if (candidate) {
        if (rules.emails.some(e => !e.endsWith("@devreemakelaardij.nl") && !recipients.includes(e) && email(candidate.email) !== e))
            reden = "E-mailgegevens spreken elkaar tegen.";
        if (rules.phones.length > 1)
            reden = "Meerdere telefoonnummers: controleer de contactpersoon.";
        const l = allLeads.find(l => l.id === candidate.leadId);
        if (l?.hypotheekAdviseurId && l.hypotheekAdviseurId !== matches[0].id)
            reden = "Dit contact is al aan een andere adviseur gekoppeld.";
    }
    if (!setting.automatisch || !setting.actiefVanaf || !validDate || sentAt < setting.actiefVanaf || p.historical)
        reden = reden || "Historische mail of automatische registratie uitgeschakeld.";
    const datum = validDate ? dutchDay(sentAt) : null;
    const data = { messageId: p.messageId, mailbox: email(p.mailbox), status: reden ? "review" : "registered", reden: reden || "Eenduidige doorverwijzing met exact contactgegeven.", onderwerp: (p.subject || "").slice(0, 191), passage: rules.text.slice(0, 1200), afzender: sender[0], ontvangers: recipients, datum: day(datum), adviseurId: matches.length === 1 ? matches[0].id : null, contactVoorstel: candidates as Prisma.InputJsonValue };
    if (p.dryRun)
        return { dryRun: true, ...data };
    try { return await locked(async (tx) => {
        const duplicate = await tx.hypotheekMailEvent.findUnique({ where: { messageId_mailbox: { messageId: p.messageId, mailbox: email(p.mailbox) } } });
        if (duplicate)
            return { event: duplicate, duplicate: true };
        const currentSetting = await tx.hypotheekInstelling.findUniqueOrThrow({ where: { id: "default" } });
        if (!currentSetting.automatisch || !currentSetting.actiefVanaf || sentAt < currentSetting.actiefVanaf) {
            data.status = "review";
            data.reden = "Automatische registratie uitgeschakeld.";
        }
        // Recheck contact/partner changes under the same registration lock.
        if (candidate?.leadId) {
            const l = await tx.lead.findUnique({ where: { id: candidate.leadId } });
            if (!l || (l.hypotheekAdviseurId && l.hypotheekAdviseurId !== data.adviseurId)) {
                data.status = "review";
                data.reden = "Contact of adviseurskoppeling is inmiddels gewijzigd.";
            }
        }
        const event = await tx.hypotheekMailEvent.create({ data });
        if (data.status === "registered" && candidate) {
            await registerInTransaction(tx, { adviseurId: data.adviseurId!, contacten: [candidate], datum, herkomst: "email", notities: `Automatisch geregistreerd uit e-mail: ${data.onderwerp}.`, mailEventId: event.id }, "mailverwerking");
        }
        return { event: await tx.hypotheekMailEvent.findUniqueOrThrow({ where: { id: event.id } }) };
    });
    } catch (error) {
        // The registration transaction has rolled back. Keep a durable review item.
        return locked(async tx => ({ event: await tx.hypotheekMailEvent.upsert({
            where: { messageId_mailbox: { messageId: p.messageId, mailbox: email(p.mailbox) } },
            create: { ...data, status: "review", reden: error instanceof ReferralError ? error.message : "Automatische registratie kon niet worden voltooid. Controleer handmatig." },
            update: {},
        }) }));
    }
}
