import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import type { AgendaAfspraak, Lead } from "@prisma/client";

/**
 * Brug tussen bezichtigingen (AgendaAfspraak, uit Realworks/Mautic) en het
 * kijker-systeem (Lead). Zorgt ervoor dat een verrijkte bezichtiging een Lead
 * (kijker) krijgt die aan de woning (Project) gekoppeld is.
 *
 * Volledig idempotent: herhaald aanroepen maakt geen duplicaten.
 */

export interface KoppelResultaat {
  leadId: string;
  projectId: string | null;
  created: boolean;
}

/** Velden die de brug nodig heeft uit een AgendaAfspraak. */
type AfspraakBrugInput = Pick<
  AgendaAfspraak,
  | "id"
  | "leadId"
  | "mauticContactId"
  | "contactNaam"
  | "contactEmail"
  | "contactTelefoon"
  | "projectId"
>;

async function koppelProject(leadId: string, projectId: string): Promise<void> {
  await prisma.leadProject.upsert({
    where: { leadId_projectId: { leadId, projectId } },
    update: {},
    create: { leadId, projectId },
  });
}

async function vindBestaandeLead(
  mauticId: string | null,
  email: string | null,
  telefoon: string | null
): Promise<Lead | null> {
  // 1. Sterkste match: Mautic-contact-id (Lead.mauticContactId is String)
  if (mauticId) {
    const byMautic = await prisma.lead.findFirst({ where: { mauticContactId: mauticId } });
    if (byMautic) return byMautic;
  }
  // 2. E-mail (MySQL-collatie is hoofdletterongevoelig)
  if (email) {
    const byEmail = await prisma.lead.findFirst({ where: { email } });
    if (byEmail) return byEmail;
  }
  // 3. Telefoon — vergelijk op alle gangbare formaten
  if (telefoon) {
    const f = normalizePhoneNumber(telefoon);
    const varianten = [...new Set([f.clean, f.plus31, f.withDash, telefoon])].filter(Boolean);
    const byPhone = await prisma.lead.findFirst({ where: { telefoon: { in: varianten } } });
    if (byPhone) return byPhone;
  }
  return null;
}

/**
 * Koppelt (of maakt) de Lead voor een bezichtiging en koppelt die aan de woning.
 * Retourneert null als er onvoldoende identificerende gegevens zijn.
 */
export async function koppelAfspraakAanLead(
  afspraak: AfspraakBrugInput
): Promise<KoppelResultaat | null> {
  // Al gekoppeld: alleen projectkoppeling borgen.
  if (afspraak.leadId) {
    if (afspraak.projectId) await koppelProject(afspraak.leadId, afspraak.projectId);
    return { leadId: afspraak.leadId, projectId: afspraak.projectId, created: false };
  }

  const mauticId = afspraak.mauticContactId != null ? String(afspraak.mauticContactId) : null;
  const email = afspraak.contactEmail?.trim() || null;
  const telefoon = afspraak.contactTelefoon?.trim() || null;

  // Zonder enige identificatie kunnen we geen betrouwbare kijker maken.
  if (!mauticId && !email && !telefoon) return null;

  let lead = await vindBestaandeLead(mauticId, email, telefoon);
  let created = false;

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        naam: afspraak.contactNaam || email || telefoon || "Onbekende kijker",
        email,
        telefoon,
        mauticContactId: mauticId,
        status: "KIJKER",
        source: "API",
      },
    });
    created = true;
  } else if (mauticId && !lead.mauticContactId) {
    // Vul de Mautic-koppeling aan op een bestaande (bv. handmatig aangemaakte) lead.
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { mauticContactId: mauticId },
    });
  }

  if (afspraak.projectId) {
    await koppelProject(lead.id, afspraak.projectId);
  }

  await prisma.agendaAfspraak.update({
    where: { id: afspraak.id },
    data: { leadId: lead.id },
  });

  return { leadId: lead.id, projectId: afspraak.projectId, created };
}
