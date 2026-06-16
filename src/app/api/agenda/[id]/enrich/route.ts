import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { searchContactByRealworksCode, updateContact } from "@/lib/mautic";
import { koppelAfspraakAanLead } from "@/lib/kijkerKoppeling";

function formatMauticDateTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function buildWoningAdres(project: {
  woningAdres: string | null;
  woningPlaats: string | null;
} | null): string | null {
  if (!project?.woningAdres) return null;
  return [project.woningAdres, project.woningPlaats].filter(Boolean).join(" ");
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
        select: { id: true, name: true, woningAdres: true, woningPlaats: true },
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
      const woningAdres = buildWoningAdres(updated.project);
      const isBezichtiging = (updated.agtype ?? "").toLowerCase().includes("bezichtiging");
      const fields: Record<string, string | number | null> = {
        afspraak_type: updated.agtype ?? null,
        volgende_afspraak_datum: formatMauticDateTime(updated.agbegin),
        volgende_afspraak_status: updated.aginactive ? "geannuleerd" : "gepland",
      };

      if (woningAdres) {
        fields.woning_adres = woningAdres;
      }

      if (isBezichtiging) {
        fields.bezichtiging_adres = woningAdres ?? updated.agdescr ?? null;
        fields.bezichtiging_datum = formatMauticDateTime(updated.agbegin);
        fields.bezichtiging_type = updated.agtype ?? null;
      }

      await updateContact(updated.mauticContactId, fields);
    } catch (err) {
      console.error("Mautic afspraakvelden bijwerken mislukt bij enrich:", err);
    }
  }

  return NextResponse.json(updated);
}
