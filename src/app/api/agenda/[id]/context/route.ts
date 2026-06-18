import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getContactFull } from "@/lib/mautic";
import { fetchWoningVanWordPress } from "@/lib/wordpress";

const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

function formatAmsterdamDate(date: Date | null): {
  iso: string | null;
  label: string | null;
  datum: string | null;
  tijd: string | null;
  bestandsDatum: string | null;
} {
  if (!date) {
    return { iso: null, label: null, datum: null, tijd: null, bestandsDatum: null };
  }

  const label = new Intl.DateTimeFormat("nl-NL", {
    timeZone: AMSTERDAM_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const datum = new Intl.DateTimeFormat("nl-NL", {
    timeZone: AMSTERDAM_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const tijd = new Intl.DateTimeFormat("nl-NL", {
    timeZone: AMSTERDAM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    iso: date.toISOString(),
    label,
    datum,
    tijd,
    bestandsDatum: `${byType.year}-${byType.month}-${byType.day}`,
  };
}

function parseMaybeJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function compactValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map(compactValue).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const compacted = compactValue(entry);
        return compacted ? `${key}: ${compacted}` : null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(" | ") : null;
  }
  return String(value);
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

  const beginLokaal = formatAmsterdamDate(afspraak.agbegin);
  const eindLokaal = formatAmsterdamDate(afspraak.agend);
  const aiProfiel = parseMaybeJson(mauticContact?.aiProfile ?? null);
  const intakeAntwoord = parseMaybeJson(mauticContact?.afspraakIntakeAntwoord ?? null);
  const zoekerData = parseMaybeJson(mauticContact?.zoekerData ?? null);
  const aiFallback = compactValue(aiProfiel);
  const intakeFallback = compactValue(intakeAntwoord);
  const zoekerFallback = compactValue(zoekerData);

  return NextResponse.json({
    afspraak: {
      id: afspraak.id,
      begin: afspraak.agbegin,
      beginLokaal,
      eind: afspraak.agend,
      eindLokaal,
      type: afspraak.agtype,
      omschrijving: afspraak.agdescr,
      locatie: afspraak.aglocation,
      memo: afspraak.agmemo,
      medewerker: afspraak.medewerkerFullname ?? afspraak.agowner,
      contactNaam: afspraak.contactNaam,
      contactEmail: afspraak.contactEmail,
      contactTelefoon: afspraak.contactTelefoon,
      leadId: afspraak.leadId,
      cheatsheetStatus: afspraak.cheatsheetStatus,
      cheatsheetPath: afspraak.cheatsheetPath,
      cheatsheetUrl: afspraak.cheatsheetUrl,
      cheatsheetGeneratedAt: afspraak.cheatsheetGeneratedAt,
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
          tags: mauticContact.tags,
          aangemeld: mauticContact.dateAdded,
          // AI profiel — geparsed JSON of raw string indien parsefout
          aiProfiel,
          // Gestructureerde AI sub-velden (gegenereerd door AI-workflow)
          aiAnalyse: {
            huidigeSituatie: mauticContact.aiCurrentSituation || aiFallback,
            woningMotivatie: mauticContact.aiHousingMotivation || intakeFallback,
            budgetIndicatie: mauticContact.aiBudgetIndication,
            tijdlijn: mauticContact.aiTimeline || zoekerFallback,
            gezinssituatie: mauticContact.aiFamilyStatus,
            leefstijlVoorkeur: mauticContact.aiLifestylePreference,
          },
          // Bezichtigingsdata
          bezichtiging: {
            notities: mauticContact.bezichtigingNotities,
            interesseScore: mauticContact.bezichtigingInteresse,
            contactType: mauticContact.contactTypeBezichtiger,
            intakeAntwoord,
            zoekprofiel: zoekerData,
          },
          // Kwalificatiedata uit Realworks (browser extensie → n8n → Mautic)
          kwalificatie: {
            heeftEigenWoning: mauticContact.kijkerEigenWoning,
            overwegtVerkoop: mauticContact.kijkerOverwegtVerkoop,
            hypotheekStatus: mauticContact.kijkerHypotheekStatus,
            aanvragerType: mauticContact.kijkerAanvragerType,
            leadHerkomst: mauticContact.kijkerLeadHerkomst,
          },
        }
      : null,
    woning: woning
      ? {
          titel: woning.titel,
          link: woning.link,
          foto: woning.featuredImage,
          adres: afspraak.project
            ? [afspraak.project.woningAdres, afspraak.project.woningPostcode, afspraak.project.woningPlaats]
                .filter(Boolean)
                .join(", ")
            : [woning.acf?.straat, woning.acf?.huisnummer, woning.acf?.postcode, woning.acf?.plaats]
                .filter(Boolean)
                .join(" ") || null,
          // Prijs & voorwaarden
          prijs: {
            koopsom: woning.acf?.koopsom ?? afspraak.project?.vraagprijs ?? null,
            koopprijsLabel: woning.acf?.koopprijs_label ?? null,
            koopconditie: woning.acf?.koopconditie ?? null,
            aanvaarding: woning.acf?.aanvaarding ?? null,
            status: woning.acf?.status ?? null,
          },
          // Fysieke kenmerken
          kenmerken: {
            woonoppervlakte: woning.acf?.woonoppervlakte ?? null,
            kadastraleOppervlakte: woning.acf?.kadastrale_oppervlakte ?? null,
            inhoud: woning.acf?.inhoud ?? null,
            kamers: woning.acf?.aantal_kamers ?? null,
            bouwjaar: woning.acf?.bouwjaar ?? null,
            bouwvorm: woning.acf?.bouwvorm ?? null,
            woonhuissoort: woning.acf?.woonhuissoort ?? null,
            woonhuistype: woning.acf?.woonhuistype ?? null,
            energieklasse: woning.acf?.energieklasse ?? null,
            energielabelDatum: woning.acf?.energielabel_datum ?? null,
            verwarming: woning.acf?.verwarming ?? null,
            isolatievormen: woning.acf?.isolatievormen ?? null,
            voorzieningen: woning.acf?.voorzieningen ?? null,
            ligging: woning.acf?.ligging ?? null,
          },
          // Locatie
          locatie: {
            straat: woning.acf?.straat ?? null,
            huisnummer: woning.acf?.huisnummer ?? null,
            postcode: woning.acf?.postcode ?? null,
            plaats: woning.acf?.plaats ?? null,
            gemeente: woning.acf?.gemeente ?? null,
            provincie: woning.acf?.provincie ?? null,
            wijk: woning.acf?.wijk ?? null,
            coordinatenX: woning.acf?.coordinaten_x ?? null,
            coordinatenY: woning.acf?.coordinaten_y ?? null,
          },
          // Teksten (voor gebruik in PDF en AI-generatie)
          teksten: {
            aanbiedingstekst: woning.acf?.aanbiedingstekst ?? null,
            introTekstAi: woning.acf?.intro_tekst_ai ?? null,
            woningBeschrijvingAi: woning.acf?.woning_beschrijving_ai ?? null,
            buitenBeschrijvingAi: woning.acf?.buiten_beschrijving_ai ?? null,
            indelingBeschrijvingAi: woning.acf?.indeling_beschrijving_ai ?? null,
            locatieBeschrijvingAi: woning.acf?.locatie_beschrijving_ai ?? null,
          },
          // Media
          media: {
            floorplanner: woning.acf?.floorplanner_fml ?? null,
            tour360: woning.acf?.tour_360_url ?? null,
            video: woning.acf?.woning_video_url ?? null,
          },
        }
      : null,
    // Eerdere afspraken met deze kijker – beschrijvingen bruikbaar als FAQ-basis
    contactHistorie: historie.map((h: typeof historie[number]) => ({
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
