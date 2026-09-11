import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { day, dutchDay, email, phone } from "./rules";
export type ContactInput = {
    leadId?: string;
    mauticContactId?: string;
    naam?: string;
    email?: string | null;
    telefoon?: string | null;
};
export type ReferralInput = {
    adviseurId: string;
    contacten: ContactInput[];
    datum?: string | null;
    notities?: string | null;
    herkomst?: string;
    mailEventId?: string;
    hypotheekAfgesloten?: boolean;
};
export class ReferralError extends Error {
    constructor(message: string, public status = 400, public existingId?: string) { super(message); }
}
export const detailInclude = { adviseur: true, deelnemers: { include: { lead: true }, orderBy: { hoofdcontact: "desc" as const } }, mailEvents: true } satisfies Prisma.HypotheekDoorverwijzingInclude;
type Tx = Prisma.TransactionClient;
export async function locked<T>(fn: (tx: Tx) => Promise<T>) {
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM hypotheek_instellingen WHERE id = 'default' FOR UPDATE`;
        return fn(tx);
    }, { maxWait: 15000, timeout: 20000 });
}
async function resolveContact(tx: Tx, input: ContactInput) {
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new ReferralError("Vul een geldig e-mailadres in of laat het leeg.");
    if (input.telefoon && !phone(input.telefoon)) throw new ReferralError("Vul een geldig telefoonnummer in of laat het leeg.");
    if (input.leadId) {
        const l = await tx.lead.findUnique({ where: { id: input.leadId } });
        if (!l)
            throw new ReferralError("Contact niet gevonden.", 404);
        return l;
    }
    const existing = await tx.lead.findMany({ select: { id: true, naam: true, email: true, telefoon: true, mauticContactId: true } });
    const matches = existing.filter(l => (input.mauticContactId && l.mauticContactId === input.mauticContactId) || (email(input.email) && email(l.email) === email(input.email)) || (phone(input.telefoon) && phone(l.telefoon) === phone(input.telefoon)));
    if (matches.length > 1)
        throw new ReferralError("Meerdere contacten passen bij deze gegevens. Selecteer het juiste bestaande contact.", 409);
    if (matches.length === 1) {
        const l = matches[0];
        if ((l.mauticContactId && input.mauticContactId && l.mauticContactId !== input.mauticContactId) || (email(l.email) && email(input.email) && email(l.email) !== email(input.email)))
            throw new ReferralError("Contactgegevens spreken elkaar tegen. Selecteer en controleer het bestaande contact.", 409);
        return tx.lead.update({ where: { id: l.id }, data: { ...(input.mauticContactId && !l.mauticContactId ? { mauticContactId: input.mauticContactId } : {}) } });
    }
    if (!input.naam?.trim())
        throw new ReferralError("Naam is verplicht.");
    return tx.lead.create({ data: { naam: input.naam.trim(), email: email(input.email) || null, telefoon: input.telefoon || null, mauticContactId: input.mauticContactId || null, status: "CONTACT", source: "HANDMATIG" } });
}
export async function registerInTransaction(tx: Tx, input: ReferralInput, actor: string) {
    if (!input.adviseurId || !Array.isArray(input.contacten) || !input.contacten.length || input.contacten.length > 10)
        throw new ReferralError("Kies een adviseur en één tot tien betrokkenen.");
    const adviseur = await tx.hypotheekAdviseur.findUnique({ where: { id: input.adviseurId } });
    if (!adviseur?.actief)
        throw new ReferralError("Kies een actieve adviseur.");
    const datum = input.datum === undefined ? day(dutchDay()) : day(input.datum);
    const leads = [];
    for (const c of input.contacten)
        leads.push(await resolveContact(tx, c));
    const ids = [...new Set(leads.map(l => l.id))];
    const existing = await tx.hypotheekDeelname.findMany({ where: { adviseurId: input.adviseurId, leadId: { in: ids } } });
    const refs = [...new Set(existing.map(e => e.doorverwijzingId))];
    if (refs.length) {
        if (refs.length !== 1 || existing.length !== ids.length)
            throw new ReferralError("Deze betrokkenen zijn al deels of in verschillende verwijzingen gekoppeld. Open de bestaande verwijzing om die te corrigeren.", 409, refs[0]);
        if (input.mailEventId)
            await tx.hypotheekMailEvent.update({ where: { id: input.mailEventId }, data: { status: "registered", doorverwijzingId: refs[0] } });
        return { existing: true, doorverwijzing: await tx.hypotheekDoorverwijzing.findUniqueOrThrow({ where: { id: refs[0] }, include: detailInclude }) };
    }
    const ref = await tx.hypotheekDoorverwijzing.create({ data: {
            adviseurId: input.adviseurId, datum, herkomst: input.herkomst || "handmatig", notities: input.notities?.slice(0, 10000) || null, geregistreerdDoor: actor, hypotheekAfgesloten: input.hypotheekAfgesloten || false,
            deelnemers: { create: ids.map((leadId, i) => ({ leadId, adviseurId: input.adviseurId, hoofdcontact: i === 0 })) },
        } });
    await tx.lead.updateMany({ where: { id: { in: ids } }, data: { hypotheekAdviseurId: input.adviseurId, hypotheekAdviseurDatum: datum, hypotheekAfgesloten: ref.hypotheekAfgesloten } });
    await tx.leadRoute.createMany({ data: ids.map(leadId => ({ leadId, routeType: "hypotheekadviseur", targetId: input.adviseurId, targetNaam: adviseur.naam, targetBedrijf: adviseur.bedrijf, notities: input.notities || null, routedById: actor })) });
    if (input.mailEventId)
        await tx.hypotheekMailEvent.update({ where: { id: input.mailEventId }, data: { status: "registered", doorverwijzingId: ref.id } });
    return { existing: false, doorverwijzing: await tx.hypotheekDoorverwijzing.findUniqueOrThrow({ where: { id: ref.id }, include: detailInclude }) };
}
export async function register(input: ReferralInput, actor: string) {
    return locked(tx => registerInTransaction(tx, input, actor));
}
export async function correct(id: string, data: Partial<ReferralInput>, actor: string) {
    return locked(tx => correctInTransaction(tx, id, data, actor));
}
export async function correctInTransaction(tx: Tx, id: string, data: Partial<ReferralInput>, actor: string) {
    const old = await tx.hypotheekDoorverwijzing.findUnique({ where: { id }, include: { deelnemers: true } });
    if (!old)
        throw new ReferralError("Doorverwijzing niet gevonden.", 404);
    const adviseurId = data.adviseurId || old.adviseurId;
    if (data.adviseurId && !await tx.hypotheekAdviseur.findFirst({ where: { id: adviseurId, actief: true } }))
        throw new ReferralError("Kies een actieve adviseur.");
    let ids = old.deelnemers.sort((a, b) => Number(b.hoofdcontact) - Number(a.hoofdcontact)).map(d => d.leadId);
    if (data.contacten) {
        if (!data.contacten.length || data.contacten.length > 10)
            throw new ReferralError("Kies één tot tien betrokkenen.");
        ids = [];
        for (const c of data.contacten)
            ids.push((await resolveContact(tx, c)).id);
        ids = [...new Set(ids)];
    }
    const clash = await tx.hypotheekDeelname.findFirst({ where: { adviseurId, leadId: { in: ids }, doorverwijzingId: { not: id } } });
    if (clash)
        throw new ReferralError("Betrokkene is al aan een andere gezamenlijke verwijzing gekoppeld.", 409, clash.doorverwijzingId);
    const datum = data.datum === undefined ? old.datum : day(data.datum);
    await tx.hypotheekDeelname.deleteMany({ where: { doorverwijzingId: id } });
    const ref = await tx.hypotheekDoorverwijzing.update({ where: { id }, data: { adviseurId, datum, ...(data.notities !== undefined ? { notities: data.notities } : {}), ...(data.hypotheekAfgesloten !== undefined ? { hypotheekAfgesloten: data.hypotheekAfgesloten } : {}), deelnemers: { create: ids.map((leadId, i) => ({ adviseurId, leadId, hoofdcontact: i === 0 })) } } });
    await tx.lead.updateMany({ where: { id: { in: old.deelnemers.map(d => d.leadId).filter(x => !ids.includes(x)) }, hypotheekAdviseurId: old.adviseurId }, data: { hypotheekAdviseurId: null, hypotheekAdviseurDatum: null, hypotheekAfgesloten: false } });
    await tx.lead.updateMany({ where: { id: { in: ids } }, data: { hypotheekAdviseurId: adviseurId, hypotheekAdviseurDatum: datum, hypotheekAfgesloten: ref.hypotheekAfgesloten } });
    await tx.leadRoute.create({ data: { leadId: ids[0], routeType: "hypotheekadviseur_correctie", targetId: adviseurId, routedById: actor, notities: `Doorverwijzing ${id} gecorrigeerd. Vorige datum: ${old.datum?.toISOString().slice(0, 10) || "onbekend"}; vorige adviseur: ${old.adviseurId}.` } });
    return tx.hypotheekDoorverwijzing.findUniqueOrThrow({ where: { id }, include: detailInclude });
}
