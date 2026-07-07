import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getContact, searchContactByRealworksCode, updateContact } from "@/lib/mautic";
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
  afspraak: { agdescr: string | null; aglocation: string | null }
): string | null {
  return buildWoningAdres(project) ?? afspraak.agdescr ?? afspraak.aglocation ?? null;
}

function isBezichtigingType(type: string | null): boolean {
  return /bezicht|viewing/i.test(type ?? "");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const contactId = Number(body.contactId);

  if (!Number.isInteger(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "contactId is verplicht" }, { status: 400 });
  }

  const [afspraak, contact] = await Promise.all([
    prisma.agendaAfspraak.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, name: true, woningAdres: true, woningPostcode: true, woningPlaats: true },
        },
      },
    }),
    getContact(contactId),
  ]);

  if (!afspraak) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }
  if (!contact) {
    return NextResponse.json({ error: "Mautic-contact niet gevonden" }, { status: 404 });
  }

  if (afspraak.agrcode) {
    const currentRcodeContact = await searchContactByRealworksCode(afspraak.agrcode);
    if (currentRcodeContact && currentRcodeContact.id !== contact.id) {
      await updateContact(currentRcodeContact.id, { realworks_code: null });
    }
    await updateContact(contact.id, { realworks_code: afspraak.agrcode });
  }

  const updated = await prisma.agendaAfspraak.update({
    where: { id },
    data: {
      contactNaam: `${contact.firstname} ${contact.lastname}`.trim() || contact.email || afspraak.contactNaam,
      contactEmail: contact.email ?? afspraak.contactEmail,
      contactTelefoon: contact.mobile ?? contact.phone ?? afspraak.contactTelefoon,
      mauticContactId: contact.id,
      enrichedAt: new Date(),
      enrichmentStatus: afspraak.projectId || afspraak.project ? "ok" : "no_project",
    },
    include: {
      project: {
        select: { id: true, name: true, woningAdres: true, woningPostcode: true, woningPlaats: true },
      },
    },
  });

  await koppelAfspraakAanLead(updated);

  const afspraakAdres = buildAfspraakAdres(updated.project, updated);
  const fields: Record<string, string | number | null> = {
    afspraak_type: updated.agtype ?? null,
    volgende_afspraak_datum: formatMauticDateTime(updated.agbegin),
    volgende_afspraak_status: updated.aginactive ? "geannuleerd" : "gepland",
  };

  if (afspraakAdres) {
    fields.woning_adres = afspraakAdres;
  }
  if (isBezichtigingType(updated.agtype)) {
    fields.bezichtiging_adres = afspraakAdres;
    fields.bezichtiging_datum = formatMauticDateTime(updated.agbegin);
  }

  await updateContact(contact.id, fields);

  return NextResponse.json({ success: true, afspraak: updated });
}

