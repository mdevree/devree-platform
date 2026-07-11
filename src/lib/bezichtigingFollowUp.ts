import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichAgendaAfspraak, isBezichtigingType } from "@/lib/agendaEnrich";
import { normalizePhoneNumber, toWhatsAppJid } from "@/lib/phone";
import { fetchWoningVanWordPress } from "@/lib/wordpress";

export const BEZICHTIGING_FOLLOWUP_PURPOSE = "bezichtiging_followup";
export const BEZICHTIGING_FOLLOWUP_CREATED_BY = "auto_bezichtiging";
const SETTINGS_KEY = "bezichtiging_followup";
const LAST_RUN_KEY = "bezichtiging_followup_last_run";

export interface BezichtigingFollowUpSettings {
  enabled: boolean;
  minUrenNaBezichtiging: number;
  maxUrenNaBezichtiging: number;
  maxDraftsPerRun: number;
  maxEnrichPerRun: number;
  // Inbound WhatsApp binnen dit aantal uren vóór de bezichtiging telt als
  // lopend gesprek dat een collega al oppakt.
  contactVoorloopUren: number;
  templateBody: string;
  rcodeTracking: boolean;
}

export const DEFAULT_FOLLOWUP_TEMPLATE = `Goedemiddag {naam},

U heeft {dagLabel} de woning {woningTitel} bezichtigd. Wij zijn benieuwd: wat was uw indruk?

Als u wilt, plannen we graag een belafspraak of een tweede bezichtiging in. U kunt de woning hier rustig terugkijken: {woningUrl}

Met vriendelijke groet,
De Vree Makelaardij`;

export const DEFAULT_BEZICHTIGING_FOLLOWUP_SETTINGS: BezichtigingFollowUpSettings = {
  enabled: true,
  minUrenNaBezichtiging: 24,
  maxUrenNaBezichtiging: 48,
  maxDraftsPerRun: 10,
  maxEnrichPerRun: 5,
  contactVoorloopUren: 48,
  templateBody: DEFAULT_FOLLOWUP_TEMPLATE,
  rcodeTracking: true,
};

export async function getBezichtigingFollowUpSettings(): Promise<BezichtigingFollowUpSettings> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null);
  const value = setting?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_BEZICHTIGING_FOLLOWUP_SETTINGS };
  }
  return { ...DEFAULT_BEZICHTIGING_FOLLOWUP_SETTINGS, ...(value as Partial<BezichtigingFollowUpSettings>) };
}

export type SkipReason =
  | "geen_bezichtiging"
  | "geannuleerd"
  | "buiten_venster"
  | "al_concept_voor_afspraak"
  | "recent_whatsapp_contact"
  | "recent_telefonisch_contact"
  | "recent_email_contact"
  | "recent_concept_zelfde_contact"
  | "ai_belafspraak_actief"
  | "geen_contact_koppeling"
  | "geen_telefoonnummer"
  | "geen_woninglink"
  | "max_per_run_bereikt";

export interface FollowUpKandidaat {
  afspraakId: string;
  agtype: string | null;
  agbegin: Date | null;
  aginactive: boolean | null;
  mauticContactId: number | null;
  contactTelefoon: string | null;
}

export interface ContactSignals {
  bestaandDraftVoorAfspraak: boolean;
  laatsteWaInboundAt: Date | null;
  laatsteWaOutboundAt: Date | null;
  laatsteAnsweredCallAt: Date | null;
  laatsteEmailSendAt: Date | null;
  anderDraftVoorContactAt: Date | null;
  actieveAiCallJob: boolean;
}

export type FollowUpBeslissing =
  | { maakConcept: true }
  | { maakConcept: false; reason: SkipReason };

export function berekenVenster(now: Date, settings: BezichtigingFollowUpSettings): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - settings.maxUrenNaBezichtiging * 3_600_000),
    to: new Date(now.getTime() - settings.minUrenNaBezichtiging * 3_600_000),
  };
}

export function beslisFollowUp(
  kandidaat: FollowUpKandidaat,
  signals: ContactSignals,
  now: Date,
  settings: BezichtigingFollowUpSettings,
): FollowUpBeslissing {
  if (!isBezichtigingType(kandidaat.agtype)) return { maakConcept: false, reason: "geen_bezichtiging" };
  if (kandidaat.aginactive) return { maakConcept: false, reason: "geannuleerd" };

  const bezichtiging = kandidaat.agbegin;
  const venster = berekenVenster(now, settings);
  if (!bezichtiging || bezichtiging < venster.from || bezichtiging > venster.to) {
    return { maakConcept: false, reason: "buiten_venster" };
  }

  if (signals.bestaandDraftVoorAfspraak) return { maakConcept: false, reason: "al_concept_voor_afspraak" };
  if (signals.actieveAiCallJob) return { maakConcept: false, reason: "ai_belafspraak_actief" };

  // Outbound ná de bezichtiging = al opgevolgd. Outbound vlak ervóór (meestal
  // afspraakbevestiging) telt bewust niet. Inbound vlak vóór of ná = lopend gesprek.
  const inboundCutoff = new Date(bezichtiging.getTime() - settings.contactVoorloopUren * 3_600_000);
  if (signals.laatsteWaOutboundAt && signals.laatsteWaOutboundAt > bezichtiging) {
    return { maakConcept: false, reason: "recent_whatsapp_contact" };
  }
  if (signals.laatsteWaInboundAt && signals.laatsteWaInboundAt > inboundCutoff) {
    return { maakConcept: false, reason: "recent_whatsapp_contact" };
  }
  if (signals.laatsteAnsweredCallAt && signals.laatsteAnsweredCallAt > bezichtiging) {
    return { maakConcept: false, reason: "recent_telefonisch_contact" };
  }
  if (signals.laatsteEmailSendAt && signals.laatsteEmailSendAt > bezichtiging) {
    return { maakConcept: false, reason: "recent_email_contact" };
  }
  if (signals.anderDraftVoorContactAt && signals.anderDraftVoorContactAt > bezichtiging) {
    return { maakConcept: false, reason: "recent_concept_zelfde_contact" };
  }

  if (!kandidaat.mauticContactId) return { maakConcept: false, reason: "geen_contact_koppeling" };
  if (!kandidaat.contactTelefoon || !toWhatsAppJid(kandidaat.contactTelefoon)) {
    return { maakConcept: false, reason: "geen_telefoonnummer" };
  }

  return { maakConcept: true };
}

export function renderFollowUpTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  ));
}

const WEEKDAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

export function dagLabelVoor(bezichtigingDatum: Date, now: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dagen = Math.round((startOfDay(now) - startOfDay(bezichtigingDatum)) / 86_400_000);
  if (dagen <= 1) return "gisteren";
  if (dagen === 2) return "eergisteren";
  if (dagen <= 6) return `afgelopen ${WEEKDAGEN[bezichtigingDatum.getDay()]}`;
  return `op ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(bezichtigingDatum)}`;
}

export function metRcode(url: string, agrcode: string | null, enabled: boolean): string {
  const rcode = agrcode?.trim();
  if (!enabled || !rcode) return url;
  return `${url}${url.includes("?") ? "&" : "?"}rcode=${encodeURIComponent(rcode)}`;
}

export interface PrepareRunResult {
  ok: boolean;
  enabled: boolean;
  dryRun: boolean;
  windowFrom: string;
  windowTo: string;
  created: { draftId: string | null; afspraakId: string; recipientName: string | null }[];
  skipped: { afspraakId: string; systemid: number | null; reason: SkipReason }[];
  errors: { afspraakId: string; message: string }[];
}

async function verzamelSignals(afspraak: {
  id: string;
  mauticContactId: number | null;
  contactTelefoon: string | null;
}): Promise<ContactSignals> {
  const jid = afspraak.contactTelefoon ? toWhatsAppJid(afspraak.contactTelefoon) : null;
  const phoneFormats = afspraak.contactTelefoon
    ? Object.values(normalizePhoneNumber(afspraak.contactTelefoon)).filter(Boolean)
    : [];

  const [bestaandDraft, laatsteInbound, laatsteOutbound, laatsteCall, laatsteEmailSend, anderDraft, actieveJob] =
    await Promise.all([
      prisma.followUpDraft.findFirst({
        where: { agendaAfspraakId: afspraak.id, purpose: BEZICHTIGING_FOLLOWUP_PURPOSE },
        select: { id: true },
      }),
      jid
        ? prisma.waMessage.findFirst({
            where: { direction: "INBOUND", conversation: { waPhone: jid } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
        : null,
      jid
        ? prisma.waMessage.findFirst({
            where: { direction: "OUTBOUND", conversation: { waPhone: jid } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
        : null,
      afspraak.mauticContactId || phoneFormats.length
        ? prisma.call.findFirst({
            where: {
              reason: { in: ["completed", "answered"] },
              OR: [
                ...(afspraak.mauticContactId ? [{ mauticContactId: afspraak.mauticContactId }] : []),
                ...(phoneFormats.length
                  ? [{ callerNumber: { in: phoneFormats } }, { destinationNumber: { in: phoneFormats } }]
                  : []),
              ],
            },
            orderBy: { timestamp: "desc" },
            select: { timestamp: true },
          })
        : null,
      afspraak.mauticContactId
        ? prisma.mauticEvent.findFirst({
            where: { mauticContactId: afspraak.mauticContactId, eventType: "email.send" },
            orderBy: { occurredAt: "desc" },
            select: { occurredAt: true },
          })
        : null,
      afspraak.mauticContactId || phoneFormats.length
        ? prisma.followUpDraft.findFirst({
            where: {
              status: { not: "rejected" },
              NOT: { agendaAfspraakId: afspraak.id },
              OR: [
                ...(afspraak.mauticContactId ? [{ mauticContactId: afspraak.mauticContactId }] : []),
                ...(phoneFormats.length ? [{ recipientPhone: { in: phoneFormats } }] : []),
              ],
            },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          })
        : null,
      prisma.aiCallJob.findFirst({
        where: { agendaAfspraakId: afspraak.id, status: { notIn: ["cancelled", "failed"] } },
        select: { id: true },
      }),
    ]);

  return {
    bestaandDraftVoorAfspraak: Boolean(bestaandDraft),
    laatsteWaInboundAt: laatsteInbound?.createdAt ?? null,
    laatsteWaOutboundAt: laatsteOutbound?.createdAt ?? null,
    laatsteAnsweredCallAt: laatsteCall?.timestamp ?? null,
    laatsteEmailSendAt: laatsteEmailSend?.occurredAt ?? null,
    anderDraftVoorContactAt: anderDraft?.createdAt ?? null,
    actieveAiCallJob: Boolean(actieveJob),
  };
}

export async function prepareBezichtigingFollowUpDrafts(options?: {
  dryRun?: boolean;
  now?: Date;
}): Promise<PrepareRunResult> {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun === true;
  const settings = await getBezichtigingFollowUpSettings();
  const venster = berekenVenster(now, settings);

  const result: PrepareRunResult = {
    ok: true,
    enabled: settings.enabled,
    dryRun,
    windowFrom: venster.from.toISOString(),
    windowTo: venster.to.toISOString(),
    created: [],
    skipped: [],
    errors: [],
  };

  if (!settings.enabled) {
    await schrijfLastRun(result, dryRun);
    return result;
  }

  const afspraken = await prisma.agendaAfspraak.findMany({
    where: {
      agbegin: { gte: venster.from, lte: venster.to },
      NOT: { aginactive: true },
    },
    include: {
      project: { select: { id: true, name: true, realworksId: true, woningAdres: true } },
      lead: { select: { naam: true, telefoon: true } },
    },
    orderBy: { agbegin: "asc" },
  });

  const bezichtigingen = afspraken.filter((afspraak) => isBezichtigingType(afspraak.agtype));

  let enriched = 0;
  for (let index = 0; index < bezichtigingen.length; index += 1) {
    let afspraak = bezichtigingen[index];

    // Verrijk alleen wat nog geen contactkoppeling heeft (gecapt: Mautic/Realworks-calls).
    if ((!afspraak.mauticContactId || !afspraak.contactTelefoon) && enriched < settings.maxEnrichPerRun && !dryRun) {
      enriched += 1;
      try {
        const updated = await enrichAgendaAfspraak(afspraak.id);
        if (updated) {
          const project = afspraak.project
            ?? (updated.projectId
              ? await prisma.project.findUnique({
                  where: { id: updated.projectId },
                  select: { id: true, name: true, realworksId: true, woningAdres: true },
                })
              : null);
          afspraak = { ...afspraak, ...updated, project, lead: afspraak.lead ?? null };
        }
      } catch (err) {
        result.errors.push({
          afspraakId: afspraak.id,
          message: `Verrijken mislukt: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const telefoon = afspraak.contactTelefoon || afspraak.lead?.telefoon || null;
    const kandidaat: FollowUpKandidaat = {
      afspraakId: afspraak.id,
      agtype: afspraak.agtype,
      agbegin: afspraak.agbegin,
      aginactive: afspraak.aginactive,
      mauticContactId: afspraak.mauticContactId,
      contactTelefoon: telefoon,
    };

    let beslissing: FollowUpBeslissing;
    try {
      const signals = await verzamelSignals({
        id: afspraak.id,
        mauticContactId: afspraak.mauticContactId,
        contactTelefoon: telefoon,
      });
      beslissing = beslisFollowUp(kandidaat, signals, now, settings);
    } catch (err) {
      result.errors.push({
        afspraakId: afspraak.id,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!beslissing.maakConcept) {
      result.skipped.push({ afspraakId: afspraak.id, systemid: afspraak.systemid ?? null, reason: beslissing.reason });
      continue;
    }

    if (result.created.length >= settings.maxDraftsPerRun) {
      result.skipped.push({ afspraakId: afspraak.id, systemid: afspraak.systemid ?? null, reason: "max_per_run_bereikt" });
      continue;
    }

    try {
      const woning = afspraak.project?.realworksId
        ? await fetchWoningVanWordPress(afspraak.project.realworksId).catch(() => null)
        : null;
      const woningUrl = woning?.link || null;
      if (!woningUrl) {
        result.skipped.push({ afspraakId: afspraak.id, systemid: afspraak.systemid ?? null, reason: "geen_woninglink" });
        continue;
      }

      const woningTitel = woning?.titel
        || afspraak.project?.woningAdres
        || afspraak.project?.name
        || afspraak.aglocation
        || "de woning";
      const naam = afspraak.contactNaam || afspraak.lead?.naam || "";
      const trackedUrl = metRcode(woningUrl, afspraak.agrcode, settings.rcodeTracking);
      const body = renderFollowUpTemplate(settings.templateBody, {
        naam: naam || "mevrouw/meneer",
        woningTitel,
        woningUrl: trackedUrl,
        dagLabel: afspraak.agbegin ? dagLabelVoor(afspraak.agbegin, now) : "onlangs",
      });

      if (dryRun) {
        result.created.push({ draftId: null, afspraakId: afspraak.id, recipientName: naam || null });
        continue;
      }

      const draft = await prisma.followUpDraft.create({
        data: {
          channel: "whatsapp",
          purpose: BEZICHTIGING_FOLLOWUP_PURPOSE,
          agendaAfspraakId: afspraak.id,
          mauticContactId: afspraak.mauticContactId,
          projectId: afspraak.projectId,
          recipientName: naam || null,
          recipientPhone: telefoon,
          recipientEmail: afspraak.contactEmail,
          body,
          links: [{ title: woningTitel, url: trackedUrl, type: "woning" }],
          status: "draft",
          createdBy: BEZICHTIGING_FOLLOWUP_CREATED_BY,
        },
      });
      result.created.push({ draftId: draft.id, afspraakId: afspraak.id, recipientName: naam || null });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Race met een parallelle run; de unique op (agendaAfspraakId, purpose) hield het tegen.
        result.skipped.push({ afspraakId: afspraak.id, systemid: afspraak.systemid ?? null, reason: "al_concept_voor_afspraak" });
      } else {
        result.errors.push({
          afspraakId: afspraak.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await schrijfLastRun(result, dryRun);
  return result;
}

async function schrijfLastRun(result: PrepareRunResult, dryRun: boolean) {
  if (dryRun) return;
  const value = {
    at: new Date().toISOString(),
    enabled: result.enabled,
    windowFrom: result.windowFrom,
    windowTo: result.windowTo,
    created: result.created.length,
    skipped: result.skipped.slice(0, 50),
    errors: result.errors.slice(0, 20),
  };
  await prisma.appSetting.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value },
    create: { key: LAST_RUN_KEY, value },
  }).catch((err) => {
    console.error("Laatste-run rapportage opslaan mislukt:", err);
  });
}

export async function getBezichtigingFollowUpLastRun() {
  const setting = await prisma.appSetting.findUnique({ where: { key: LAST_RUN_KEY } }).catch(() => null);
  return setting?.value ?? null;
}
