import type { ProjectStatus } from "@prisma/client";

export const TAXATIE_SUBFOLDERS = {
  contracteren: "1 Contracteren",
  rechercheren: "2 Rechercheren",
  analyseren: "3 Analyseren",
  waarderen: "4 Waarderen",
  rapporteren: "5 Rapporteren & 6 Archiveren",
} as const;

export const TAXATIE_TERMINAL_STATUSES: ProjectStatus[] = ["AFGEROND", "GEANNULEERD"];

export const TAXATIE_CHECKLIST_ITEMS = [
  { key: "bevoegdheid", label: "Bevoegdheid opdrachtgever en deskundigheid taxateur", phase: "Contracteren" },
  { key: "belangenconflict", label: "Belangenconflict taxateur/tweede taxateur gecontroleerd", phase: "Contracteren" },
  { key: "personalia", label: "Personalia opdrachtgever opgevraagd en geverifieerd", phase: "Contracteren" },
  { key: "stukken-opvragen", label: "Stukken en relevante informatie opgevraagd", phase: "Contracteren" },
  { key: "taxatiedoel", label: "Taxatiedoel, taxatiestandaard en waardebegrip vastgesteld", phase: "Contracteren" },
  { key: "opdracht-ondertekend", label: "Opdracht gecontroleerd en ondertekend", phase: "Contracteren" },
  { key: "opname-afspraak", label: "Afspraak opname object gemaakt", phase: "Rechercheren" },
  { key: "kadaster-opvragen", label: "Kadaster opgevraagd/ontvangen", phase: "Rechercheren" },
  { key: "bodemrapport", label: "Bodemrapport ontvangen", phase: "Rechercheren" },
  { key: "akte", label: "Akte van levering/Hyp4 ontvangen", phase: "Rechercheren" },
  { key: "energielabel", label: "Energielabel ontvangen", phase: "Rechercheren" },
  { key: "bestemming", label: "Bestemming gecontroleerd", phase: "Rechercheren" },
  { key: "koopakte", label: "Koopakte ontvangen", phase: "Rechercheren" },
  { key: "appartementsstukken", label: "Appartements-/VvE-stukken ontvangen", phase: "Rechercheren" },
  { key: "bouwkundigrapport", label: "Bouwkundig rapport ontvangen", phase: "Analyseren" },
  { key: "funderingsrapport", label: "Funderingsinformatie ontvangen", phase: "Analyseren" },
  { key: "waarderingsstuk", label: "Waarderings-/referentiestuk ontvangen", phase: "Waarderen" },
  { key: "rapportage", label: "Rapportagefase-document ontvangen", phase: "Rapporteren" },
  { key: "rapport-nota-mailen", label: "Rapport en nota aan opdrachtgever verstuurd", phase: "Rapporteren" },
  { key: "werkblad-archiveren", label: "Werkblad ingescand en opgeslagen", phase: "Rapporteren" },
] as const;

export type TaxatieMailMatchStatus = "matched" | "ambiguous" | "unmatched";
export type TaxatieArchiveStatus = "pending" | "archived" | "review_needed" | "failed";
export type TaxatieChecklistAction = "complete_task" | "review_task";

export interface TaxatieMailPayload {
  messageId?: string | null;
  mailbox?: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  receivedAt?: string | null;
  bodyText?: string | null;
  textPlain?: string | null;
  textHtml?: string | null;
  attachments?: Array<{ fileName?: string | null; mimeType?: string | null }>;
  hints?: {
    address?: string | null;
    postcode?: string | null;
    plaats?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    contactName?: string | null;
    hypotheekAdviseur?: string | null;
    reference?: string | null;
  } | null;
}

export interface TaxatieProjectForMatch {
  id: string;
  name: string;
  type: string;
  projectStatus: string | null;
  status: string;
  address: string | null;
  woningAdres: string | null;
  woningPostcode: string | null;
  woningPlaats: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  hypotheekAdviseur?: {
    naam: string | null;
    bedrijf: string | null;
    email?: string | null;
    telefoon?: string | null;
  } | null;
}

export interface TaxatieChecklistSignal {
  key: string;
  label: string;
  action: TaxatieChecklistAction;
  confidence: "hoog" | "middel";
  evidence: string;
}

export interface TaxatieMailClassification {
  targetSubfolder: string;
  category: "contracteren" | "rechercheren" | "analyseren" | "waarderen" | "rapporteren";
  suggestedProjectStatus: "ACTIEF" | "RAPPORT_CONCEPT" | null;
  checklistSignals: TaxatieChecklistSignal[];
}

export interface TaxatieMatchCandidate {
  projectId: string;
  name: string;
  score: number;
  reasons: string[];
  nextcloudBasePath: string;
  targetSubfolder: string;
}

export interface TaxatieMailMatchResult {
  status: TaxatieMailMatchStatus;
  messageId: string;
  mailbox: string;
  classification: TaxatieMailClassification;
  selected: TaxatieMatchCandidate | null;
  candidates: TaxatieMatchCandidate[];
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const POSTCODE_RE = /\b([1-9][0-9]{3})\s*([A-Z]{2})\b/i;
const PHONE_RE = /(?:\+31|0031|0)\s?6[\s.-]?\d[\d\s.-]{6,}/i;

function lower(value: unknown) {
  return String(value ?? "").toLowerCase();
}

export function normalizeText(value: unknown) {
  return lower(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9@.+ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePostcode(value: unknown) {
  const match = String(value ?? "").toUpperCase().match(POSTCODE_RE);
  return match ? `${match[1]}${match[2]}` : "";
}

export function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0031")) return `0${digits.slice(4)}`;
  if (digits.startsWith("31")) return `0${digits.slice(2)}`;
  return digits;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function mailText(payload: TaxatieMailPayload) {
  return [
    payload.subject,
    payload.from,
    payload.to,
    payload.bodyText,
    payload.textPlain,
    payload.textHtml,
    ...(payload.attachments || []).map((a) => a.fileName),
    payload.hints?.address,
    payload.hints?.postcode,
    payload.hints?.plaats,
    payload.hints?.contactEmail,
    payload.hints?.contactPhone,
    payload.hints?.contactName,
    payload.hints?.hypotheekAdviseur,
    payload.hints?.reference,
  ].filter(Boolean).join("\n");
}

function containsAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function signal(key: string, label: string, evidence: string, action: TaxatieChecklistAction = "complete_task"): TaxatieChecklistSignal {
  return { key, label, action, confidence: "hoog", evidence };
}

export function classifyTaxatieMail(payload: TaxatieMailPayload): TaxatieMailClassification {
  const text = normalizeText(mailText(payload));
  const signals: TaxatieChecklistSignal[] = [];
  let category: TaxatieMailClassification["category"] = "rechercheren";
  let suggestedProjectStatus: TaxatieMailClassification["suggestedProjectStatus"] = null;

  if (containsAny(text, ["nwwi", "aanvraagbevestiging", "verzoek tot acceptatie", "opdrachtbevestiging", "opdracht ondertekend", "opdrachtvoorwaarden"])) {
    category = "contracteren";
    suggestedProjectStatus = "ACTIEF";
    signals.push(signal("opdracht-ondertekend", "Opdracht/acceptatie ontvangen", "Mail bevat NWWI/opdracht/acceptatie-signaal"));
  }

  if (containsAny(text, ["kadaster", "eigendomsinformatie", "kadastraal bericht", "eigendomsbericht"])) {
    category = "rechercheren";
    signals.push(signal("kadaster-opvragen", "Kadaster opgevraagd/ontvangen", "Mail of bijlage verwijst naar Kadaster/eigendomsinformatie"));
  }
  if (containsAny(text, ["bodemrapport", "bodemloket", "bodeminformatie"])) {
    category = "rechercheren";
    signals.push(signal("bodemrapport", "Bodemrapport ontvangen", "Mail of bijlage verwijst naar bodemrapport"));
  }
  if (containsAny(text, ["hyp4", "hyp 4", "akte van levering", "leveringsakte", "akte"])) {
    category = "rechercheren";
    signals.push(signal("akte", "Akte ontvangen", "Mail of bijlage verwijst naar akte/leveringsakte/Hyp4"));
  }
  if (containsAny(text, ["energielabel"])) {
    category = "rechercheren";
    signals.push(signal("energielabel", "Energielabel ontvangen", "Mail of bijlage verwijst naar energielabel"));
  }
  if (containsAny(text, ["koopakte", "koopovereenkomst"])) {
    category = "rechercheren";
    signals.push(signal("koopakte", "Koopakte ontvangen", "Mail of bijlage verwijst naar koopakte/koopovereenkomst"));
  }
  if (containsAny(text, ["splitsingsakte", "ondersplitsing", "rectificatie", "vve", "mjop", "meerjarenonderhoud", "begroting", "notulen", "jaarrekening", "polis", "hh reglement", "huishoudelijk reglement", "balans", "kvk"])) {
    category = "analyseren";
    signals.push(signal("appartementsstukken", "Appartements-/VvE-stukken ontvangen", "Mail of bijlage verwijst naar appartements- of VvE-stukken"));
  }
  if (containsAny(text, ["bouwkundig rapport", "bouwkundige keuring"])) {
    category = "analyseren";
    signals.push(signal("bouwkundigrapport", "Bouwkundig rapport ontvangen", "Mail of bijlage verwijst naar bouwkundig rapport"));
  }
  if (containsAny(text, ["fundering", "funderingsrapport"])) {
    category = "analyseren";
    signals.push(signal("funderingsrapport", "Funderingsinformatie ontvangen", "Mail of bijlage verwijst naar fundering"));
  }
  if (containsAny(text, ["stamkaart", "referentie", "brainbay", "waarde wonen", "referentieobject"])) {
    category = "waarderen";
    signals.push(signal("waarderingsstuk", "Waarderings-/referentiestuk ontvangen", "Mail of bijlage verwijst naar waardering, Brainbay of referenties"));
  }
  if (containsAny(text, ["taxatierapport", "validatie", "rapport gevalideerd", "rapport verzonden", "nota", "factuur", "werkblad"])) {
    category = "rapporteren";
    suggestedProjectStatus = "RAPPORT_CONCEPT";
    signals.push(signal("rapportage", "Rapportagefase-document ontvangen", "Mail of bijlage verwijst naar taxatierapport, validatie, nota of werkblad"));
  }

  const targetSubfolder = {
    contracteren: TAXATIE_SUBFOLDERS.contracteren,
    rechercheren: TAXATIE_SUBFOLDERS.rechercheren,
    analyseren: TAXATIE_SUBFOLDERS.analyseren,
    waarderen: TAXATIE_SUBFOLDERS.waarderen,
    rapporteren: TAXATIE_SUBFOLDERS.rapporteren,
  }[category];

  return {
    targetSubfolder,
    category,
    suggestedProjectStatus,
    checklistSignals: unique(signals.map((s) => JSON.stringify(s))).map((s) => JSON.parse(s)),
  };
}

export function extractTaxatieMailHints(payload: TaxatieMailPayload) {
  const textRaw = mailText(payload);
  const emails = unique(textRaw.match(EMAIL_RE) || []).map((email) => email.toLowerCase());
  const postcode = payload.hints?.postcode || normalizePostcode(textRaw);
  const phone = payload.hints?.contactPhone || (textRaw.match(PHONE_RE)?.[0] ?? "");

  return {
    address: normalizeText(payload.hints?.address),
    postcode: normalizePostcode(postcode),
    plaats: normalizeText(payload.hints?.plaats),
    contactEmail: lower(payload.hints?.contactEmail),
    contactPhone: normalizePhone(phone),
    contactName: normalizeText(payload.hints?.contactName),
    hypotheekAdviseur: normalizeText(payload.hints?.hypotheekAdviseur),
    reference: normalizeText(payload.hints?.reference),
    emails,
    fullText: normalizeText(textRaw),
  };
}

export function taxatieNextcloudBasePath(project: TaxatieProjectForMatch, receivedAt?: string | null) {
  const date = receivedAt ? new Date(receivedAt) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const address = [project.woningAdres || project.address || project.name, project.woningPostcode, project.woningPlaats]
    .filter(Boolean)
    .join(" ")
    .replace(/[/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return `${year}/${address || project.id}`;
}

function scoreProject(project: TaxatieProjectForMatch, payload: TaxatieMailPayload, targetSubfolder: string): TaxatieMatchCandidate {
  const hints = extractTaxatieMailHints(payload);
  const reasons: string[] = [];
  let score = 0;

  const projectAddress = normalizeText([project.woningAdres || project.address, project.woningPostcode, project.woningPlaats].filter(Boolean).join(" "));
  const projectStreet = normalizeText(project.woningAdres || project.address || project.name);
  const projectPostcode = normalizePostcode(project.woningPostcode);
  const projectPlace = normalizeText(project.woningPlaats);
  const contactEmail = lower(project.contactEmail);
  const contactPhone = normalizePhone(project.contactPhone);
  const contactName = normalizeText(project.contactName);
  const adviserText = normalizeText([project.hypotheekAdviseur?.naam, project.hypotheekAdviseur?.bedrijf, project.hypotheekAdviseur?.email, project.hypotheekAdviseur?.telefoon].filter(Boolean).join(" "));

  if (projectPostcode && hints.postcode && projectPostcode === hints.postcode) {
    score += 35;
    reasons.push("postcode exact");
  }
  if (projectStreet && hints.fullText.includes(projectStreet)) {
    score += 35;
    reasons.push("adres in mailtekst");
  } else if (projectAddress && hints.fullText.includes(projectAddress)) {
    score += 35;
    reasons.push("volledig objectadres in mailtekst");
  } else if (hints.address && projectAddress.includes(hints.address)) {
    score += 25;
    reasons.push("adres-hint matcht project");
  }
  if (projectPlace && hints.fullText.includes(projectPlace)) {
    score += 10;
    reasons.push("plaats matcht");
  }
  if (contactEmail && (hints.emails.includes(contactEmail) || hints.contactEmail === contactEmail)) {
    score += 30;
    reasons.push("opdrachtgever e-mail matcht");
  }
  if (contactPhone && hints.contactPhone && contactPhone === hints.contactPhone) {
    score += 20;
    reasons.push("opdrachtgever telefoon matcht");
  }
  if (contactName && hints.fullText.includes(contactName)) {
    score += 15;
    reasons.push("opdrachtgever naam matcht");
  }
  if (adviserText && hints.fullText.includes(adviserText)) {
    score += 15;
    reasons.push("hypotheekadviseur matcht");
  }
  if (normalizeText(project.name) && hints.fullText.includes(normalizeText(project.name))) {
    score += 10;
    reasons.push("projectnaam matcht");
  }

  return {
    projectId: project.id,
    name: project.name,
    score: Math.min(score, 100),
    reasons,
    nextcloudBasePath: taxatieNextcloudBasePath(project, payload.receivedAt),
    targetSubfolder,
  };
}

export function matchTaxatieMail(projects: TaxatieProjectForMatch[], payload: TaxatieMailPayload): TaxatieMailMatchResult {
  const classification = classifyTaxatieMail(payload);
  const messageId = String(payload.messageId || `${payload.mailbox || "unknown"}:${payload.receivedAt || ""}:${payload.subject || ""}`).slice(0, 191);
  const mailbox = String(payload.mailbox || payload.to || "unknown").toLowerCase().slice(0, 191);
  const candidates = projects
    .filter((project) => project.type === "TAXATIE" && !TAXATIE_TERMINAL_STATUSES.includes(project.projectStatus as ProjectStatus))
    .map((project) => scoreProject(project, payload, classification.targetSubfolder))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const [top, second] = candidates;
  let status: TaxatieMailMatchStatus = "unmatched";
  let selected: TaxatieMatchCandidate | null = null;

  if (top && top.score >= 85 && (!second || top.score - second.score >= 15)) {
    status = "matched";
    selected = top;
  } else if (top && top.score >= 60) {
    status = "ambiguous";
  }

  return { status, messageId, mailbox, classification, selected, candidates };
}

export function projectStatusRank(status: string | null) {
  const flow = ["LEAD", "OTD_VERSTUURD", "OTD_ONDERTEKEND", "ACTIEF", "RAPPORT_CONCEPT", "AFGEROND"];
  const index = flow.indexOf(status || "");
  return index === -1 ? -1 : index;
}
