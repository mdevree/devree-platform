import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getContactFull } from "@/lib/mautic";

const WP_BASE_URL = "https://www.devreemakelaardij.nl/wp-json/wp/v2";

async function fetchWoningVanWordPress(realworksId: string) {
  try {
    const url = new URL(`${WP_BASE_URL}/woning`);
    url.searchParams.set("realworks_id", realworksId);
    url.searchParams.set("per_page", "1");
    // next.revalidate is a Next.js extension to fetch, not in standard RequestInit
    const fetchOptions = { headers: { Accept: "application/json" }, next: { revalidate: 300 } };
    const res = await fetch(url.toString(), fetchOptions as RequestInit);
    if (!res.ok) return null;
    const woningen = await res.json();
    if (!woningen?.length) return null;
    const w = woningen[0];
    return {
      wpId: w.id,
      slug: w.slug,
      link: w.link,
      titel: w.title?.rendered ?? null,
      acf: w.acf ?? {},
    };
  } catch {
    return null;
  }
}

/**
 * GET /api/agenda/[id]/context
 *
 * Geeft alle context terug die n8n nodig heeft om een bezichtiging-PDF te genereren:
 * - Afspraakgegevens
 * - Volledig Mautic contactprofiel van de kijker (incl. AI-data, scores, intentie)
 * - Woninginformatie van WordPress (beschrijving, kenmerken, foto)
 * - Afspraakhistorie voor dit contact (eerdere bezichtigingen / gesprekken)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          woningAdres: true,
          woningPostcode: true,
          woningPlaats: true,
          realworksId: true,
          vraagprijs: true,
          woningOppervlakte: true,
        },
      },
    },
  });

  if (!afspraak)
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });

  // Parallel: Mautic contact + woning + afspraakhistorie ophalen
  const [mauticContact, woning, historie] = await Promise.all([
    // Volledige Mautic data inclusief AI profiel, scores en intentievelden
    afspraak.mauticContactId
      ? getContactFull(afspraak.mauticContactId)
      : Promise.resolve(null),

    // Woning van WordPress via project realworksId
    afspraak.project?.realworksId
      ? fetchWoningVanWordPress(afspraak.project.realworksId)
      : Promise.resolve(null),

    // Eerdere afspraken van dezelfde kijker (agrcode) of medewerker/object
    afspraak.agrcode
      ? prisma.agendaAfspraak.findMany({
          where: {
            agrcode: afspraak.agrcode,
            id: { not: afspraak.id },
            agbegin: { lt: afspraak.agbegin ?? new Date() },
          },
          orderBy: { agbegin: "desc" },
          take: 10,
          select: {
            agbegin: true,
            agtype: true,
            agdescr: true,
            agmemo: true,
            aglocation: true,
            medewerkerFullname: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    afspraak: {
      id: afspraak.id,
      begin: afspraak.agbegin,
      eind: afspraak.agend,
      type: afspraak.agtype,
      omschrijving: afspraak.agdescr,
      locatie: afspraak.aglocation,
      memo: afspraak.agmemo,
      medewerker: afspraak.medewerkerFullname ?? afspraak.agowner,
      contactNaam: afspraak.contactNaam,
      contactEmail: afspraak.contactEmail,
      contactTelefoon: afspraak.contactTelefoon,
    },
    kijker: mauticContact
      ? {
          id: mauticContact.id,
          naam: `${mauticContact.firstname} ${mauticContact.lastname}`.trim(),
          email: mauticContact.email,
          telefoon: mauticContact.mobile ?? mauticContact.phone,
          adres: [mauticContact.address1, mauticContact.address2].filter(Boolean).join(" "),
          postcode: mauticContact.zipcode,
          plaats: mauticContact.city,
          // AI profiel (JSON string met door AI gegenereerde kennis over contact)
          aiProfiel: mauticContact.aiProfile ? (() => {
            try { return JSON.parse(mauticContact.aiProfile!); } catch { return mauticContact.aiProfile; }
          })() : null,
          // Pipeline / verkoopintentie (bewaar voor context in PDF)
          tags: mauticContact.tags,
          aangemeld: mauticContact.dateAdded,
        }
      : null,
    woning: woning
      ? {
          titel: woning.titel,
          link: woning.link,
          adres: afspraak.project
            ? [afspraak.project.woningAdres, afspraak.project.woningPostcode, afspraak.project.woningPlaats]
                .filter(Boolean)
                .join(", ")
            : null,
          vraagprijs: afspraak.project?.vraagprijs ?? null,
          oppervlakte: afspraak.project?.woningOppervlakte ?? null,
          // Alle ACF velden (beschrijving, kenmerken, foto URLs etc.)
          beschrijving: woning.acf?.aanbiedingstekst ?? null,
          introTekst: woning.acf?.intro_tekst_ai ?? null,
          kenmerken: {
            woonoppervlakte: woning.acf?.woonoppervlakte,
            kamers: woning.acf?.aantal_kamers,
            bouwjaar: woning.acf?.bouwjaar,
            energieklasse: woning.acf?.energieklasse,
            verwarming: woning.acf?.verwarming,
            isolatievormen: woning.acf?.isolatievormen,
          },
        }
      : null,
    // Eerdere afspraken met deze kijker – beschrijvingen bruikbaar als FAQ-basis
    contactHistorie: historie.map((h) => ({
      datum: h.agbegin,
      type: h.agtype,
      omschrijving: h.agdescr,
      memo: h.agmemo,
      locatie: h.aglocation,
      medewerker: h.medewerkerFullname,
    })),
    project: afspraak.project
      ? {
          id: afspraak.project.id,
          naam: afspraak.project.name,
          realworksId: afspraak.project.realworksId,
        }
      : null,
  });
}
