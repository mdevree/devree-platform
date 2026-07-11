import { prisma } from "@/lib/prisma";
import {
  createContact,
  searchContactByEmail,
  searchContactByRealworksCode,
  updateContact,
  type MauticContact,
} from "@/lib/mautic";
import { koppelAfspraakAanLead } from "@/lib/kijkerKoppeling";
import { findRealworksContactForAgenda, type RealworksRelationContact } from "@/lib/agendaRealworksContact";

const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

export function isBezichtigingType(type: string | null): boolean {
  return /bezicht|viewing/i.test(type ?? "");
}

function formatMauticDateTime(date: Date | null): string | null {
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}:${byType.second}`;
}

function buildWoningAdres(project: {
  woningAdres: string | null;
  woningPostcode?: string | null;
  woningPlaats: string | null;
} | null): string | null {
  if (!project?.woningAdres) return null;
  const plaatsregel = [project.woningPostcode, project.woningPlaats].filter(Boolean).join(" ");
  return [project.woningAdres, plaatsregel].filter(Boolean).join(", ");
}

function buildAfspraakAdres(
  project: {
    woningAdres: string | null;
    woningPostcode?: string | null;
    woningPlaats: string | null;
  } | null,
  afspraak: {
    agdescr: string | null;
    aglocation: string | null;
  }
): string | null {
  return buildWoningAdres(project) ?? afspraak.agdescr ?? afspraak.aglocation ?? null;
}

function contactNaam(contact: Pick<MauticContact, "firstname" | "lastname">): string {
  return `${contact.firstname} ${contact.lastname}`.trim();
}

function normalizeEmail(email: string | null | undefined): string | null {
  return email?.trim().toLowerCase() || null;
}

function hasIdentity(contact: MauticContact | null): boolean {
  if (!contact) return false;
  return Boolean(contact.firstname || contact.lastname || contact.email || contact.mobile || contact.phone);
}

function matchesRealworksContact(
  contact: MauticContact | null,
  realworksContact: RealworksRelationContact | null
): boolean {
  if (!contact || !realworksContact) return false;
  const rwEmail = normalizeEmail(realworksContact.email);
  if (rwEmail && normalizeEmail(contact.email) === rwEmail) return true;
  const rwPhone = realworksContact.mobile || realworksContact.phone;
  if (rwPhone && [contact.mobile, contact.phone].filter(Boolean).includes(rwPhone)) return true;
  return Boolean(realworksContact.name && contactNaam(contact).toLowerCase() === realworksContact.name.toLowerCase());
}

function realworksContactFields(
  contact: RealworksRelationContact,
  agrcode: string | null
): Record<string, string | number | null> {
  const fields: Record<string, string | number | null> = {
    realworks_code: contact.realworksCode || agrcode,
  };
  if (contact.firstname) fields.firstname = contact.firstname;
  if (contact.lastname) fields.lastname = contact.lastname;
  if (contact.email) fields.email = contact.email;
  if (contact.mobile) fields.mobile = contact.mobile;
  if (contact.phone) fields.phone = contact.phone;
  return fields;
}

async function resolveMauticContactForAfspraak(
  agrcode: string | null,
  byRealworksCode: MauticContact | null,
  realworksContact: RealworksRelationContact | null
): Promise<MauticContact | null> {
  if (!realworksContact) return byRealworksCode;

  const byEmail = realworksContact.email
    ? await searchContactByEmail(realworksContact.email)
    : null;

  let chosen: MauticContact | null = null;
  if (matchesRealworksContact(byRealworksCode, realworksContact)) {
    chosen = byRealworksCode;
  } else if (byEmail) {
    chosen = byEmail;
    if (byRealworksCode && byRealworksCode.id !== byEmail.id) {
      await updateContact(byRealworksCode.id, { realworks_code: null });
    }
  } else if (byRealworksCode && !hasIdentity(byRealworksCode)) {
    chosen = byRealworksCode;
  } else if (
    (!byRealworksCode && (realworksContact.email || realworksContact.mobile || realworksContact.name)) ||
    (byRealworksCode && (realworksContact.email || realworksContact.mobile))
  ) {
    chosen = await createContact({
      firstname: realworksContact.firstname,
      lastname: realworksContact.lastname,
      email: realworksContact.email || undefined,
      mobile: realworksContact.mobile || undefined,
      phone: realworksContact.phone || undefined,
    });
    if (chosen && byRealworksCode && byRealworksCode.id !== chosen.id) {
      await updateContact(byRealworksCode.id, { realworks_code: null });
    }
  } else {
    chosen = byRealworksCode;
  }

  if (chosen) {
    const updated = await updateContact(chosen.id, realworksContactFields(realworksContact, agrcode));
    return updated ?? chosen;
  }

  return null;
}

export type EnrichedAgendaAfspraak = NonNullable<Awaited<ReturnType<typeof enrichAgendaAfspraak>>>;

/**
 * Verrijk een agenda-afspraak: Mautic-contact opzoeken/aanmaken via Realworks-gegevens,
 * project koppelen, Lead (kijker) koppelen en Mautic-afspraakvelden bijwerken.
 * Geeft null terug als de afspraak niet bestaat.
 */
export async function enrichAgendaAfspraak(afspraakId: string) {
  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id: afspraakId } });
  if (!afspraak) return null;

  // Parallel: Mautic-contact opzoeken via agrcode, Realworks-capture uitlezen en project zoeken.
  const [mauticByRealworksCode, realworksContact, project] = await Promise.all([
    afspraak.agrcode ? searchContactByRealworksCode(afspraak.agrcode) : Promise.resolve(null),
    findRealworksContactForAgenda(afspraak),
    afspraak.agobjcode
      ? prisma.project.findFirst({ where: { realworksId: afspraak.agobjcode } })
      : afspraak.projectId
      ? prisma.project.findUnique({ where: { id: afspraak.projectId } })
      : Promise.resolve(null),
  ]);

  const mauticContact = await resolveMauticContactForAfspraak(
    afspraak.agrcode,
    mauticByRealworksCode,
    realworksContact
  );

  const hasContact = mauticContact !== null;
  const hasProject = project !== null;

  let enrichmentStatus: string;
  if (hasContact && hasProject) enrichmentStatus = "ok";
  else if (!hasContact && !hasProject) enrichmentStatus = "no_contact";
  else if (!hasContact) enrichmentStatus = "no_contact";
  else enrichmentStatus = "no_project";

  const updated = await prisma.agendaAfspraak.update({
    where: { id: afspraakId },
    data: {
      contactNaam: mauticContact
        ? `${mauticContact.firstname} ${mauticContact.lastname}`.trim()
        : afspraak.contactNaam,
      contactEmail: mauticContact?.email ?? afspraak.contactEmail,
      contactTelefoon: mauticContact?.mobile ?? mauticContact?.phone ?? afspraak.contactTelefoon,
      mauticContactId: mauticContact?.id ?? afspraak.mauticContactId,
      projectId: project?.id ?? afspraak.projectId,
      enrichedAt: new Date(),
      enrichmentStatus,
    },
    include: {
      project: {
        select: { id: true, name: true, woningAdres: true, woningPostcode: true, woningPlaats: true },
      },
    },
  });

  // Brug naar het kijker-systeem: koppel/maak een Lead (kijker) en hang die aan
  // de woning. Best-effort — een fout hier mag de enrich-respons niet breken.
  if (updated.mauticContactId) {
    try {
      await koppelAfspraakAanLead(updated);
    } catch (err) {
      console.error("Kijker-koppeling mislukt bij enrich:", err);
    }
  }

  // Vul Mautic afspraakvelden zodat templates zoals
  // {contactfield=bezichtiging_adres} en {contactfield=volgende_afspraak_datum}
  // direct bruikbaar zijn na agenda-enrichment.
  if (updated.mauticContactId) {
    try {
      const afspraakAdres = buildAfspraakAdres(updated.project, updated);
      const isBezichtiging = isBezichtigingType(updated.agtype);
      const fields: Record<string, string | number | null> = {
        afspraak_type: updated.agtype ?? null,
        volgende_afspraak_datum: formatMauticDateTime(updated.agbegin),
        volgende_afspraak_status: updated.aginactive ? "geannuleerd" : "gepland",
      };

      if (afspraakAdres) {
        fields.woning_adres = afspraakAdres;
      }

      if (isBezichtiging) {
        fields.bezichtiging_adres = afspraakAdres;
        fields.bezichtiging_datum = formatMauticDateTime(updated.agbegin);
      }

      await updateContact(updated.mauticContactId, fields);
    } catch (err) {
      console.error("Mautic afspraakvelden bijwerken mislukt bij enrich:", err);
    }
  }

  return updated;
}
