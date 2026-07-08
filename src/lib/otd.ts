import { ProjectStatus, ProjectType, Verkoopmethode } from "@prisma/client";

export type OtdOpdrachtgever = {
  aanhef?: string | null;
  initialen?: string | null;
  naam: string;
  voornamen?: string | null;
  geboorteplaats?: string | null;
  woonplaats?: string | null;
  postcode?: string | null;
  straat?: string | null;
  email?: string | null;
  telefoon?: string | null;
  burgerlijkeStaat?: string | null;
  mauticContactId?: number | null;
  realworksCode?: string | null;
};

export type OtdProjectData = {
  source: "realworks" | "platform" | "manual";
  realworksSystemId?: string | null;
  realworksObjectCode?: string | null;
  realworksProjectSystemId?: string | null;
  realworksRelationCode?: string | null;
  realworksRelationName?: string | null;
  statusCode?: string | null;
  statusLabel?: string | null;
  object: {
    adres?: string | null;
    postcode?: string | null;
    plaats?: string | null;
    kadastraal?: {
      gemeente?: string | null;
      sectie?: string | null;
      nummer?: string | null;
      grootteM2?: string | null;
    };
    woonoppervlakte?: string | null;
    energielabelEinddatum?: string | null;
  };
  afspraken: {
    datumOpdracht?: string | null;
    vraagprijs?: number | null;
    koopconditie?: "kosten koper" | "vrij op naam" | null;
    courtagePercentage?: number | null;
    aanvaarding?: string | null;
    verkoopmethode?: Verkoopmethode | null;
    bijzondereAfspraken?: string | null;
  };
  kosten: {
    publiciteit: number;
    energielabel: number;
    intrekking: number;
    bedenktijd: number;
  };
  opdrachtgevers: OtdOpdrachtgever[];
};

export type OtdCompletenessIssue = {
  field: string;
  label: string;
  severity: "warning" | "required";
};

export type OtdKadasterRegel = {
  gemeente?: string | null;
  sectie?: string | null;
  nummer?: string | null;
  grootteM2?: string | null;
  eigendomssituatie?: string | null;
  rawText?: string | null;
};

const DEFAULT_OTD_COSTS = {
  publiciteit: 650,
  energielabel: 350,
  intrekking: 600,
  bedenktijd: 350,
};

export function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function decodeRealworksMask(value: unknown, mask: unknown): string | null {
  const rawValue = stringValue(value);
  const rawMask = stringValue(mask);
  if (!rawValue || !rawMask) return rawValue;

  for (const entry of rawMask.split("|")) {
    const separator = entry.indexOf(";");
    if (separator < 0) continue;
    if (entry.slice(0, separator) === rawValue) return entry.slice(separator + 1) || rawValue;
  }

  return rawValue;
}

export function parseDutchNumber(value: unknown): number | null {
  const raw = stringValue(value);
  if (!raw) return null;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDutchMoneyToCentsFreeInt(value: unknown): number | null {
  const parsed = parseDutchNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function formatDutchDateLabel(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (!match) return text;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return text;
  }

  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `€ ${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(value)},-`;
}

export function formatCourtage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `${new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)} % incl. BTW`;
}

function formatAdres(fields: Record<string, unknown>): string | null {
  const street = stringValue(fields.lisstreet);
  const number = stringValue(fields.liststrnr);
  const letter = stringValue(fields.house_letter);
  const addition = stringValue(fields.house_number_extension);
  const street2 = stringValue(fields.lisstreet2);
  const parts = [street, [number, letter, addition].filter(Boolean).join("")].filter(Boolean);
  const adres = parts.join(" ").trim();
  return [adres, street2].filter(Boolean).join(" ").trim() || null;
}

function isFutureDutchDate(value: unknown, now = new Date()): boolean {
  const raw = stringValue(value);
  if (!raw) return false;
  const match = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return false;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 23, 59, 59);
  return date.getTime() >= now.getTime();
}

function verkoopmethodeFromRealworks(fields: Record<string, unknown>): Verkoopmethode | null {
  const raw = stringValue(fields.verkoopmethode ?? fields.verkoopmethode_label ?? fields.lisstremar);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized.includes("zonder biedtermijn")) return "BIEDEN_ZONDER_BIEDTERMIJN";
  if (normalized.includes("gesloten")) return "GESLOTEN_INSCHRIJVING_MET_BIEDTERMIJN";
  if (normalized.includes("veiling")) return "OPEN_VEILING_MET_BIEDTERMIJN";
  if (normalized.includes("biedtermijn") || normalized.includes("inschrijving")) {
    return "INSCHRIJVING_MET_BIEDTERMIJN";
  }
  return null;
}

export function normalizeRealworksBrokerObjectForOtd(
  fields: Record<string, unknown>,
  now = new Date(),
): OtdProjectData {
  const statusCode = stringValue(fields.lisstate);
  const statusLabel = stringValue(fields.lisstate_label)
    ?? decodeRealworksMask(fields.lisstate, fields.lisstate__MASK);
  const koopconditieLabel = stringValue(fields.lissalecon_label)
    ?? decodeRealworksMask(fields.lissalecon, fields.lissalecon__MASK);
  const vraagprijs = parseDutchMoneyToCentsFreeInt(fields.lissalepr);
  const courtagePercentage = parseDutchNumber(fields.courtage3);
  const energielabelGeldig = isFutureDutchDate(fields.energieeinddatum, now);
  const relationName = stringValue(fields.lisrcode_result);
  const relationCode = stringValue(fields.lisrcode);

  return {
    source: "realworks",
    realworksSystemId: stringValue(fields._systemid),
    realworksObjectCode: stringValue(fields.objectcode ?? fields.lisnr),
    realworksProjectSystemId: stringValue(fields.project_systemid),
    realworksRelationCode: relationCode,
    realworksRelationName: relationName,
    statusCode,
    statusLabel,
    object: {
      adres: formatAdres(fields),
      postcode: stringValue(fields.liszipcode),
      plaats: stringValue(fields.liscity),
      kadastraal: {
        gemeente: stringValue(fields.kadGemeente ?? fields.kadgemeente ?? fields.kadastralegemeente),
        sectie: stringValue(fields.kadSectie ?? fields.kadsectie ?? fields.kadastralesectie),
        nummer: stringValue(fields.kadNummer ?? fields.kadnummer ?? fields.kadastraalnummer),
        grootteM2: stringValue(fields.kadGrootte ?? fields.kadgrootte ?? fields.kadastraleoppervlakte),
      },
      woonoppervlakte: stringValue(fields.reslivspac),
      energielabelEinddatum: stringValue(fields.energieeinddatum),
    },
    afspraken: {
      datumOpdracht: new Intl.DateTimeFormat("nl-NL").format(now),
      vraagprijs,
      koopconditie: koopconditieLabel === "vrij op naam" ? "vrij op naam" : koopconditieLabel === "kosten koper" ? "kosten koper" : null,
      courtagePercentage,
      aanvaarding: formatDutchDateLabel(fields.aanvaarding ?? fields.lisdatefre ?? fields.lissttrans) ?? "in overleg",
      verkoopmethode: verkoopmethodeFromRealworks(fields),
      bijzondereAfspraken: stringValue(fields.bijzondereAfspraken),
    },
    kosten: {
      ...DEFAULT_OTD_COSTS,
      energielabel: energielabelGeldig ? 0 : DEFAULT_OTD_COSTS.energielabel,
    },
    opdrachtgevers: relationName ? [{
      naam: relationName,
      realworksCode: relationCode,
    }] : [],
  };
}

export function isOtdTriggerFromRealworks(fields: Record<string, unknown>): boolean {
  const statusCode = stringValue(fields.lisstate);
  const statusLabel = stringValue(fields.lisstate_label)
    ?? decodeRealworksMask(fields.lisstate, fields.lisstate__MASK);
  return statusCode === "13" || statusLabel === "In aanmelding";
}

export function otdProjectName(data: OtdProjectData): string {
  const adres = data.object.adres;
  const plaats = data.object.plaats;
  return [adres, plaats].filter(Boolean).join(", ") || data.realworksObjectCode || "Nieuwe verkoopopdracht";
}

export function otdCompletenessIssues(data: OtdProjectData): OtdCompletenessIssue[] {
  const issues: OtdCompletenessIssue[] = [];

  if (!data.object.adres) issues.push({ field: "object.adres", label: "Objectadres ontbreekt", severity: "required" });
  if (!data.object.postcode) issues.push({ field: "object.postcode", label: "Postcode ontbreekt", severity: "warning" });
  if (!data.afspraken.vraagprijs) issues.push({ field: "afspraken.vraagprijs", label: "Vraagprijs ontbreekt", severity: "required" });
  if (!data.afspraken.courtagePercentage) issues.push({ field: "afspraken.courtagePercentage", label: "Courtage ontbreekt", severity: "required" });
  if (!data.opdrachtgevers.length) issues.push({ field: "opdrachtgevers", label: "Opdrachtgever(s) ontbreken", severity: "required" });

  const kad = data.object.kadastraal;
  if (!kad?.gemeente || !kad.sectie || !kad.nummer) {
    issues.push({ field: "object.kadastraal", label: "Kadastrale aanduiding ontbreekt of is incompleet", severity: "warning" });
  }

  data.opdrachtgevers.forEach((opdrachtgever, index) => {
    const prefix = `opdrachtgevers.${index}`;
    if (!opdrachtgever.voornamen) issues.push({ field: `${prefix}.voornamen`, label: `Voornamen ontbreken bij opdrachtgever ${index + 1}`, severity: "warning" });
    if (!opdrachtgever.email) issues.push({ field: `${prefix}.email`, label: `E-mailadres ontbreekt bij opdrachtgever ${index + 1}`, severity: "warning" });
    if (!opdrachtgever.burgerlijkeStaat) issues.push({ field: `${prefix}.burgerlijkeStaat`, label: `Burgerlijke staat ontbreekt bij opdrachtgever ${index + 1}`, severity: "warning" });
  });

  return issues;
}

export function opdrachtgeverDisplayName(opdrachtgever: OtdOpdrachtgever): string {
  return [opdrachtgever.aanhef, opdrachtgever.initialen, opdrachtgever.naam]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function signatureBlocksForOtd(opdrachtgevers: OtdOpdrachtgever[]) {
  return [
    ...opdrachtgevers.map((opdrachtgever, index) => ({
      title: opdrachtgevers.length === 1 ? "De opdrachtgever" : `Opdrachtgever ${index + 1}`,
      name: opdrachtgeverDisplayName(opdrachtgever) || opdrachtgever.naam,
    })),
    { title: "Het NVM-lid", name: "De heer M. de Vree" },
  ];
}

export function normalizeKadasterText(rawValue: unknown): OtdKadasterRegel | null {
  const rawText = stringValue(rawValue)?.replace(/\s+/g, " ");
  if (!rawText) return null;

  const oppervlakteMatch = rawText.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²|ha|are|ca)/i);
  const withoutSize = rawText.replace(/\b\d+(?:[.,]\d+)?\s*(?:m2|m²|ha|are|ca)/ig, " ").trim();
  const parts = withoutSize.split(/\s+/).filter(Boolean);
  const sectionIndex = parts.findIndex((part) => /^[A-Z]{1,3}$/i.test(part));

  if (sectionIndex <= 0 || !parts[sectionIndex + 1]) {
    return { rawText };
  }

  return {
    gemeente: parts.slice(0, sectionIndex).join(" "),
    sectie: parts[sectionIndex].toUpperCase(),
    nummer: parts[sectionIndex + 1],
    grootteM2: oppervlakteMatch?.[1]?.replace(",", ".") ?? null,
    rawText,
  };
}

export function kadasterRegelFromRealworksFields(fields: Record<string, unknown>): OtdKadasterRegel | null {
  const gemeente = stringValue(fields.kadcity ?? fields.kadGemeente ?? fields.kadgemeente ?? fields.gemeente);
  const sectie = stringValue(fields.kadsection ?? fields.kadSectie ?? fields.kadsectie ?? fields.sectie);
  const nummer = stringValue(fields.kadperc ?? fields.kadNummer ?? fields.kadnummer ?? fields.perceelnummer ?? fields.nummer);
  const grootteM2 = stringValue(
    fields.ko_grootteperceel
      ?? fields.ko_kadsurface
      ?? fields.kadGrootte
      ?? fields.kadgrootte
      ?? fields.grootteM2
      ?? fields.grootte
      ?? fields.oppervlakte,
  );
  const eigendomssituatie = stringValue(
    fields.kadastersoort_label
      ?? decodeRealworksMask(fields.kadastersoort, fields.kadastersoort__MASK)
      ?? fields.eigendomssituatie,
  );

  if (!gemeente && !sectie && !nummer && !grootteM2 && !eigendomssituatie) return null;

  return {
    gemeente,
    sectie: sectie?.toUpperCase() ?? null,
    nummer,
    grootteM2,
    eigendomssituatie,
    rawText: [gemeente, sectie, nummer, grootteM2 ? `${grootteM2} m²` : null].filter(Boolean).join(" ") || null,
  };
}

export function firstCompleteKadasterRegel(rows: OtdKadasterRegel[]): OtdKadasterRegel | null {
  return rows.find((row) => row.gemeente && row.sectie && row.nummer) ?? rows[0] ?? null;
}

export function projectUpdateDataFromOtd(data: OtdProjectData) {
  return {
    name: otdProjectName(data),
    type: ProjectType.VERKOOP,
    projectStatus: ProjectStatus.LEAD,
    status: "lead",
    address: data.object.adres ?? null,
    // In het platform is realworksId de publieke objectcode (bijv. SE11902):
    // WordPress en agenda-afspraken koppelen daarop. Het interne Realworks
    // _systemid blijft beschikbaar in de intake-payload voor kadastermapping.
    realworksId: data.realworksObjectCode ?? data.realworksSystemId ?? null,
    realworksSystemId: data.realworksSystemId ?? null,
    realworksProjectSystemId: data.realworksProjectSystemId ?? null,
    contactName: data.realworksRelationName ?? null,
    woningAdres: data.object.adres ?? null,
    woningPostcode: data.object.postcode ?? null,
    woningPlaats: data.object.plaats ?? null,
    kadGemeente: data.object.kadastraal?.gemeente ?? null,
    kadSectie: data.object.kadastraal?.sectie ?? null,
    kadNummer: data.object.kadastraal?.nummer ?? null,
    kadGrootte: data.object.kadastraal?.grootteM2 ?? null,
    woningOppervlakte: data.object.woonoppervlakte ?? null,
    vraagprijs: data.afspraken.vraagprijs ?? null,
    courtagePercentage: data.afspraken.courtagePercentage ?? null,
    aanvaarding: data.afspraken.aanvaarding ?? null,
    verkoopmethode: data.afspraken.verkoopmethode ?? null,
    bijzondereAfspraken: data.afspraken.bijzondereAfspraken ?? null,
    kostenPubliciteit: data.kosten.publiciteit,
    kostenEnergielabel: data.kosten.energielabel,
    kostenIntrekking: data.kosten.intrekking,
    kostenBedenktijd: data.kosten.bedenktijd,
  };
}
