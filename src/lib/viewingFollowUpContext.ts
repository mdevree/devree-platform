import type { AgendaAfspraak } from "@prisma/client";
import { prisma } from "./prisma";
import { getContactFull, getMauticNotesPage, verifyViewingRelation } from "./mautic";

type Identity = Pick<AgendaAfspraak, "mauticContactId" | "agrcode" | "relationRelationid">;
type Appointment = Identity & Pick<AgendaAfspraak, "agbegin" | "agstatus" | "agtype" | "agdescr">;

function conflicts(a: Identity, b: Identity) {
  return (["mauticContactId", "agrcode", "relationRelationid"] as const)
    .some(key => a[key] && b[key] && a[key] !== b[key]);
}

export function nextAppointment(identity: Identity, candidates: Appointment[]) {
  const relevant = candidates.filter(a => !/geannuleerd|vervallen|cancel/i.test(a.agstatus || ""));
  if (relevant.some(a => conflicts(a, identity))) throw Error("Controleer conflicterende relatiegegevens in de agenda");
  const next = relevant[0];
  if (!next) return null;
  if (next.agstatus?.toLowerCase() !== "definitief" || !next.agbegin) {
    throw Error("Controleer de nog onbevestigde vervolgafspraak");
  }
  // Only the street and house number from a formatted viewing address are customer-facing.
  const address = /bezicht|viewing/i.test(next.agtype || "")
    ? next.agdescr?.match(/^([^,\n]+? \d+[a-z\d -]*),\s*\d{4}\s*[A-Z]{2}\b/i)?.[1] : undefined;
  return { when: next.agbegin, address };
}

async function readViewingIdentity(source: Identity) {
  if (!source.mauticContactId) throw Error("Contact ontbreekt voor agendacontrole");
  const crm = await getContactFull(source.mauticContactId, AbortSignal.timeout(10000));
  if (!crm || crm.id !== source.mauticContactId) throw Error("Mautic-contact niet verifieerbaar");
  const identity = { mauticContactId: crm.id, agrcode: crm.realworksCode || source.agrcode,
    relationRelationid: crm.realworksSystemId || source.relationRelationid };
  if (conflicts(source, identity)) throw Error("Relatiecode van bezichtiging en contact wijkt af");
  return identity;
}

export async function readNextAppointment(source: Identity, now: Date) {
  const identity = await readViewingIdentity(source);
  const matches = await prisma.agendaAfspraak.findMany({
    where: {
      agbegin: { gt: now }, AND: [{ OR: [{ aginactive: false }, { aginactive: null }] }],
      OR: [
        { mauticContactId: identity.mauticContactId },
        ...(identity.agrcode ? [{ agrcode: identity.agrcode }] : []),
        ...(identity.relationRelationid ? [{ relationRelationid: identity.relationRelationid }] : []),
      ],
    },
    select: { agbegin: true, agstatus: true, agtype: true, agdescr: true, mauticContactId: true, agrcode: true, relationRelationid: true },
    orderBy: { agbegin: "asc" },
  });
  if (matches.some(a => !a.mauticContactId)) {
    await verifyViewingRelation(identity.agrcode, identity.relationRelationid, identity.mauticContactId);
  }
  return nextAppointment(identity, matches);
}

export function isMailNote(text: string) {
  return /^\s*(?:📧|✉️?|📩|📤|📨)?\s*e-?mail\s+(?:verzonden|ontvangen|verstuurd|van|naar)\b/i.test(text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " "));
}

export function isOriginalViewingConfirmation(text: string, address: string | undefined) {
  if (!address?.trim()) return false;
  const plain = text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
  if (!/^\s*(?:📧|✉️?)?\s*e-?mail (verzonden|verstuurd)\b/i.test(plain)) return false;
  const subject = plain.match(/Onderwerp:[ \t]*([^\r\n]*)/i)?.[1]?.trim().toLowerCase();
  const prefix = `bezichtiging: ${address.trim().toLowerCase()}`;
  return !!subject && (subject === prefix || subject.startsWith(prefix + " te ") || subject.startsWith(prefix + ","));
}

export async function latestContactEmail(contactId: number) {
  let start = 0;
  let latest: { at: Date; text: string } | null = null;
  for (;;) {
    const page = await getMauticNotesPage(contactId, start);
    for (const note of page.notes) {
      if (!isMailNote(note.text)) continue;
      const at = new Date(note.dateTime);
      if (!note.dateTime || !Number.isFinite(at.getTime())) throw Error("Onbekende datum bij contactmail");
      if (!latest || at > latest.at) latest = { at, text: note.text };
    }
    if (page.nextStart === null) return latest;
    if (page.nextStart <= start) throw Error("Contactmail is onvolledig opgehaald");
    start = page.nextStart;
  }
}

export function appointmentFollowUp(name: string, listing: string, appointment: { when: Date; address?: string }, url: string) {
  const moment = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam",
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(appointment.when);
  return `Goedemiddag ${name},\n\nWe zien elkaar ${moment} uur${appointment.address ? ` bij ${appointment.address}` : ""}. Dan hoor ik graag hoe u de bezichtiging van ${listing} heeft ervaren. Hier kunt u de woning nog eens bekijken: ${url}\n\nMet vriendelijke groet,\nDe Vree Makelaardij`;
}
