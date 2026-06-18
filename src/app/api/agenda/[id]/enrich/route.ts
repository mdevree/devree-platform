import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { searchContactByRealworksCode, updateContact } from "@/lib/mautic";
import { koppelAfspraakAanLead } from "@/lib/kijkerKoppeling";

const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

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

function isBezichtigingType(type: string | null): boolean {
  return /bezicht|viewing/i.test(type ?? "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak)
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });

  // Parallel: Mautic-contact opzoeken via agrcode + project opzoeken via agobjcode
  const [mauticContact, project] = await Promise.all([
    afspraak.agrcode ? searchContactByRealworksCode(afspraak.agrcode) : Promise.resolve(null),
    afspraak.agobjcode
      ? prisma.project.findFirst({ where: { realworksId: afspraak.agobjcode } })
      : afspraak.projectId
      ? prisma.project.findUnique({ where: { id: afspraak.projectId } })
      : Promise.resolve(null),
  ]);

  const hasContact = mauticContact !== null;
  const hasProject = project !== null;

  let enrichmentStatus: string;
  if (hasContact && hasProject) enrichmentStatus = "ok";
  else if (!hasContact && !hasProject) enrichmentStatus = "no_contact";
  else if (!hasContact) enrichmentStatus = "no_contact";
  else enrichmentStatus = "no_project";

  const updated = await prisma.agendaAfspraak.update({
    where: { id },
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

  return NextResponse.json(updated);
}
