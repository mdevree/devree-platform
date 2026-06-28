/**
 * Mautic CRM API wrapper
 * Communiceert met connect.devreemakelaardij.nl via OAuth2
 */

import { normalizePhoneNumber, type PhoneFormats } from "./phone";

const MAUTIC_URL = process.env.MAUTIC_URL || "https://connect.devreemakelaardij.nl";
const MAUTIC_CLIENT_ID = process.env.MAUTIC_CLIENT_ID || "";
const MAUTIC_CLIENT_SECRET = process.env.MAUTIC_CLIENT_SECRET || "";

// Token cache (in-memory, herstart bij server restart)
let tokenCache: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null = null;

/**
 * Verkrijg een geldig OAuth2 access token
 */
async function getAccessToken(): Promise<string> {
  // Check of bestaand token nog geldig is (met 60s marge)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.accessToken;
  }

  // Refresh token als beschikbaar
  if (tokenCache?.refreshToken) {
    try {
      const response = await fetch(`${MAUTIC_URL}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenCache.refreshToken,
          client_id: MAUTIC_CLIENT_ID,
          client_secret: MAUTIC_CLIENT_SECRET,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        tokenCache = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || tokenCache.refreshToken,
          expiresAt: Date.now() + data.expires_in * 1000,
        };
        return tokenCache.accessToken;
      }
    } catch {
      // Refresh mislukt, val terug op client credentials
    }
  }

  // Client credentials grant
  const response = await fetch(`${MAUTIC_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: MAUTIC_CLIENT_ID,
      client_secret: MAUTIC_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mautic OAuth fout: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

/**
 * Doe een geauthenticeerde API call naar Mautic
 */
async function mauticFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();

  return fetch(`${MAUTIC_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

export interface MauticContact {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  points: number;
  lastActive: string | null;
}

export interface MauticContactFull extends MauticContact {
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  country: string | null;
  website: string | null;
  // AI data profiel veld (JSON string opgeslagen in een custom veld)
  aiProfile: string | null;
  // AI sub-velden (gegenereerd door AI-workflow op basis van Mautic data + interacties)
  aiCurrentSituation: string | null;      // ai_current_situation
  aiHousingMotivation: string | null;     // ai_housing_motivation
  aiBudgetIndication: string | null;      // ai_budget_indication
  aiTimeline: string | null;              // ai_timeline
  aiFamilyStatus: string | null;         // ai_family_status
  aiLifestylePreference: string | null;  // ai_lifestyle_preference
  // Bezichtigingsvelden
  bezichtigingNotities: string | null;   // bezichtiging_notities
  bezichtigingInteresse: number | null;  // bezichtiging_interesse (score 0-100)
  contactTypeBezichtiger: string | null; // contact_type_bezichtiger
  afspraakIntakeAntwoord: string | null; // afspraak_intake_antwoord
  zoekerData: string | null;             // zoeker_data (JSON string met zoekprofiel)
  // Kijker kwalificatievelden (gevuld vanuit Realworks broker.response via browser extensie)
  kijkerEigenWoning: boolean | null;     // kijker_eigen_woning
  kijkerOverwegtVerkoop: boolean | null; // kijker_overweegt_verkoop
  kijkerHypotheekStatus: string | null;  // kijker_hypotheek_status
  kijkerAanvragerType: string | null;    // kijker_aanvrager_type
  kijkerLeadHerkomst: string | null;     // kijker_lead_herkomst
  // Ruwe velden voor uitgebreide weergave
  tags: string[];
  dateAdded: string | null;
}

export interface MauticContactPipeline extends MauticContact {
  // Verkoopproces velden
  verkoopgesprekStatus: string | null;   // verkoopgesprek_status
  timingGesprek: string | null;          // timing_gesprek
  segmentPrioriteit: string | null;      // segment_prioriteit
  verkoopreden: string | null;           // verkoop_reden
  verkooopTiming: string | null;         // verkoop_timing
  intentieVerkoop: string | null;        // intentie_verkoop
  emailFollowupVerstuurd: boolean;       // email_followup_verstuurd
  volgendeAfspraakStatus: string | null; // volgende_afspraak_status
  datumVerkoopgesprek: string | null;    // datum_verkoopgesprek
  // Interesse scores (0-100)
  interesses: {
    financiering: number | null;
    duurzaamheid: number | null;
    verbouwing: number | null;
    investeren: number | null;
    starters: number | null;
  };
  bezichtigingInteresse: number | null;  // bezichtiging_interesse
  // Kwalificatievelden (voor kans-type classificatie)
  kijkerEigenWoning: boolean | null;     // kijker_eigen_woning
  kijkerOverwegtVerkoop: boolean | null; // kijker_overweegt_verkoop
  kijkerHypotheekStatus: string | null;  // kijker_hypotheek_status ("ja" = heeft adviseur)
  // Berekend warm-score veld
  warmScore: number;
}

/**
 * Zoek een contact in Mautic op basis van telefoonnummer
 * Zoekt in phone EN mobile velden met alle 3 formaten (zelfde als n8n workflow)
 */
export async function searchContactByPhone(phoneNumber: string): Promise<MauticContact | null> {
  const formats: PhoneFormats = normalizePhoneNumber(phoneNumber);

  // Bouw Doctrine OR-query met alle 6 combinaties (3 formaten x 2 velden)
  const queryParts = [
    "where[0][expr]=orX",
    // Phone veld - alle 3 formaten
    `where[0][val][0][col]=phone`,
    `where[0][val][0][expr]=eq`,
    `where[0][val][0][val]=${encodeURIComponent(formats.clean)}`,
    `where[0][val][1][col]=phone`,
    `where[0][val][1][expr]=eq`,
    `where[0][val][1][val]=${encodeURIComponent(formats.plus31)}`,
    `where[0][val][2][col]=phone`,
    `where[0][val][2][expr]=eq`,
    `where[0][val][2][val]=${encodeURIComponent(formats.withDash)}`,
    // Mobile veld - alle 3 formaten
    `where[0][val][3][col]=mobile`,
    `where[0][val][3][expr]=eq`,
    `where[0][val][3][val]=${encodeURIComponent(formats.clean)}`,
    `where[0][val][4][col]=mobile`,
    `where[0][val][4][expr]=eq`,
    `where[0][val][4][val]=${encodeURIComponent(formats.plus31)}`,
    `where[0][val][5][col]=mobile`,
    `where[0][val][5][expr]=eq`,
    `where[0][val][5][val]=${encodeURIComponent(formats.withDash)}`,
  ];

  const queryString = queryParts.join("&");
  const response = await mauticFetch(`/api/contacts?${queryString}`);

  if (!response.ok) {
    console.error("Mautic zoekfout:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const contacts = data.contacts || {};
  const contactIds = Object.keys(contacts);

  if (contactIds.length === 0) {
    return null;
  }

  // Pak eerste contact
  const contactId = contactIds[0];
  const contact = contacts[contactId];
  const fields = contact.fields?.all || {};

  return {
    id: parseInt(contactId),
    firstname: fields.firstname || "",
    lastname: fields.lastname || "",
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    company: fields.company || null,
    points: contact.points || 0,
    lastActive: fields.last_active || null,
  };
}

/**
 * Maak een nieuw contact aan in Mautic
 */
export async function createContact(data: {
  firstname: string;
  lastname: string;
  phone?: string;
  mobile?: string;
  email?: string;
  company?: string;
}): Promise<MauticContact | null> {
  const response = await mauticFetch("/api/contacts/new", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    console.error("Mautic aanmaakfout:", response.status, await response.text());
    return null;
  }

  const result = await response.json();
  const contact = result.contact;
  const fields = contact.fields?.all || {};

  return {
    id: contact.id,
    firstname: fields.firstname || "",
    lastname: fields.lastname || "",
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    company: fields.company || null,
    points: contact.points || 0,
    lastActive: fields.last_active || null,
  };
}

/**
 * Haal contact details op via ID
 */
export async function getContact(contactId: number): Promise<MauticContact | null> {
  const response = await mauticFetch(`/api/contacts/${contactId}`);

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const contact = data.contact;
  const fields = contact.fields?.all || {};

  return {
    id: contact.id,
    firstname: fields.firstname || "",
    lastname: fields.lastname || "",
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    company: fields.company || null,
    points: contact.points || 0,
    lastActive: fields.last_active || null,
  };
}

/**
 * Haal volledige contact details op inclusief adres, tags en AI profiel
 */
export async function getContactFull(contactId: number): Promise<MauticContactFull | null> {
  const response = await mauticFetch(`/api/contacts/${contactId}`);

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const contact = data.contact;
  const fields = contact.fields?.all || {};

  // Tags ophalen
  const tags: string[] = (contact.tags || []).map((t: { tag: string }) => t.tag);

  const boolField = (val: unknown): boolean | null => {
    if (val === null || val === undefined || val === "") return null;
    return val === "1" || val === 1 || val === true;
  };

  return {
    id: contact.id,
    firstname: fields.firstname || "",
    lastname: fields.lastname || "",
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    company: fields.company || null,
    points: contact.points || 0,
    lastActive: fields.last_active || null,
    address1: fields.address1 || null,
    address2: fields.address2 || null,
    city: fields.city || null,
    state: fields.state || null,
    zipcode: fields.zipcode || null,
    country: fields.country || null,
    website: fields.website || null,
    aiProfile: fields.ai_profiel_data || null,
    aiCurrentSituation: fields.ai_current_situation || null,
    aiHousingMotivation: fields.ai_housing_motivation || null,
    aiBudgetIndication: fields.ai_budget_indication || null,
    aiTimeline: fields.ai_timeline || null,
    aiFamilyStatus: fields.ai_family_status || null,
    aiLifestylePreference: fields.ai_lifestyle_preference || null,
    bezichtigingNotities: fields.bezichtiging_notities || null,
    bezichtigingInteresse: fields.bezichtiging_interesse != null ? Number(fields.bezichtiging_interesse) : null,
    contactTypeBezichtiger: fields.contact_type_bezichtiger || null,
    afspraakIntakeAntwoord: fields.afspraak_intake_antwoord || null,
    zoekerData: fields.zoeker_data || null,
    kijkerEigenWoning: boolField(fields.kijker_eigen_woning),
    kijkerOverwegtVerkoop: boolField(fields.kijker_overweegt_verkoop),
    kijkerHypotheekStatus: fields.kijker_hypotheek_status || null,
    kijkerAanvragerType: fields.kijker_aanvrager_type || null,
    kijkerLeadHerkomst: fields.kijker_lead_herkomst || null,
    tags,
    dateAdded: contact.dateAdded || null,
  };
}

/**
 * Haal een lijst contacten op uit Mautic met zoek/paginatie
 * Standaard gesorteerd op meest recent actief
 */
export async function searchContacts(options: {
  search?: string;
  start?: number;
  limit?: number;
  orderBy?: string;
  orderByDir?: "asc" | "desc";
} = {}): Promise<{ contacts: MauticContact[]; total: number }> {
  const {
    search = "",
    start = 0,
    limit = 30,
    orderBy = "last_active",
    orderByDir = "desc",
  } = options;

  const params = new URLSearchParams({
    start: String(start),
    limit: String(limit),
    orderBy,
    orderByDir,
    minimal: "1", // geeft alleen basisvelden terug
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  const response = await mauticFetch(`/api/contacts?${params}`);

  if (!response.ok) {
    console.error("Mautic contacten lijstfout:", response.status, await response.text());
    return { contacts: [], total: 0 };
  }

  const data = await response.json();
  const rawContacts = data.contacts || {};
  const total = data.total ? parseInt(data.total) : 0;

  const contacts: MauticContact[] = Object.values(rawContacts).map((c: unknown) => {
    const contact = c as Record<string, unknown>;
    const fields = (contact.fields as Record<string, Record<string, unknown>>)?.all || {};
    return {
      id: contact.id as number,
      firstname: (fields.firstname as string) || "",
      lastname: (fields.lastname as string) || "",
      email: (fields.email as string) || null,
      phone: (fields.phone as string) || null,
      mobile: (fields.mobile as string) || null,
      company: (fields.company as string) || null,
      points: (contact.points as number) || 0,
      lastActive: (fields.last_active as string) || null,
    };
  });

  return { contacts, total };
}

/**
 * Map een ruw Mautic-veld naar een number, of null als het veld leeg is.
 * Mautic levert lege custom fields aan als "" of null (niet als undefined),
 * dus puur op `!== undefined` checken zou "leeg" foutief als 0 inlezen.
 */
function numField(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * Berekent een warm-score op basis van points en recente activiteit
 */
function calcWarmScore(points: number, lastActive: string | null): number {
  if (!lastActive) return Math.min(100, points);
  const daysSinceActive = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24);
  const activityBonus = daysSinceActive < 7 ? 30 : daysSinceActive < 30 ? 10 : 0;
  return Math.min(100, points + activityBonus);
}

/**
 * Map ruwe Mautic contact fields naar MauticContactPipeline
 */
function mapToPipeline(contact: Record<string, unknown>, contactId: number): MauticContactPipeline {
  const fields = (contact.fields as Record<string, Record<string, unknown>>)?.all || {};
  const points = (contact.points as number) || 0;
  const lastActive = (fields.last_active as string) || null;

  return {
    id: contactId,
    firstname: (fields.firstname as string) || "",
    lastname: (fields.lastname as string) || "",
    email: (fields.email as string) || null,
    phone: (fields.phone as string) || null,
    mobile: (fields.mobile as string) || null,
    company: (fields.company as string) || null,
    points,
    lastActive,
    verkoopgesprekStatus: (fields.verkoopgesprek_status as string) || null,
    timingGesprek: (fields.timing_gesprek as string) || null,
    segmentPrioriteit: (fields.segment_prioriteit as string) || null,
    verkoopreden: (fields.verkoop_reden as string) || null,
    verkooopTiming: (fields.verkoop_timing as string) || null,
    intentieVerkoop: (fields.intentie_verkoop as string) || null,
    emailFollowupVerstuurd: fields.email_followup_verstuurd === "1" || fields.email_followup_verstuurd === true,
    volgendeAfspraakStatus: (fields.volgende_afspraak_status as string) || null,
    datumVerkoopgesprek: (fields.datum_verkoopgesprek as string) || null,
    interesses: {
      financiering: numField(fields.interesse_financiering),
      duurzaamheid: numField(fields.interesse_duurzaamheid),
      verbouwing: numField(fields.interesse_verbouwing),
      investeren: numField(fields.interesse_investeren),
      starters: numField(fields.interesse_starters),
    },
    bezichtigingInteresse: numField(fields.bezichtiging_interesse),
    kijkerEigenWoning:
      fields.kijker_eigen_woning === undefined || fields.kijker_eigen_woning === null || fields.kijker_eigen_woning === ""
        ? null
        : fields.kijker_eigen_woning === "1" || fields.kijker_eigen_woning === true,
    kijkerOverwegtVerkoop:
      fields.kijker_overweegt_verkoop === undefined || fields.kijker_overweegt_verkoop === null || fields.kijker_overweegt_verkoop === ""
        ? null
        : fields.kijker_overweegt_verkoop === "1" || fields.kijker_overweegt_verkoop === true,
    kijkerHypotheekStatus: (fields.kijker_hypotheek_status as string) || null,
    warmScore: calcWarmScore(points, lastActive),
  };
}

/**
 * Haal pipeline data op voor één contact
 */
export async function getContactPipeline(contactId: number): Promise<MauticContactPipeline | null> {
  const response = await mauticFetch(`/api/contacts/${contactId}`);
  if (!response.ok) return null;

  const data = await response.json();
  const contact = data.contact as Record<string, unknown>;
  return mapToPipeline(contact, contact.id as number);
}

/**
 * Haal pipeline-contacten op uit Mautic met optionele filters
 */
export async function searchContactsWithPipeline(options: {
  search?: string;
  stage?: string;      // verkoopgesprek_status waarde
  segment?: string;    // segment_prioriteit waarde (a_sweetspot, b_volledig, etc.)
  lastActiveAfter?: string;  // YYYY-MM-DD: alleen contacten met last_active >= deze datum
  lastActiveBefore?: string; // YYYY-MM-DD: alleen contacten met last_active <= deze datum
  start?: number;
  limit?: number;
  orderBy?: string;
  orderByDir?: "asc" | "desc";
} = {}): Promise<{ contacts: MauticContactPipeline[]; total: number }> {
  const {
    search = "",
    stage,
    segment,
    lastActiveAfter,
    lastActiveBefore,
    start = 0,
    limit = 100,
    orderBy = "last_active",
    orderByDir = "desc",
  } = options;

  const params = new URLSearchParams({
    start: String(start),
    limit: String(limit),
    orderBy,
    orderByDir,
    // Geen minimal=1 zodat we alle custom fields terugkrijgen
  });

  // Bouw where-filters voor Mautic Doctrine query
  const whereParts: string[] = [];
  let whereIdx = 0;

  if (stage) {
    whereParts.push(`where[${whereIdx}][col]=verkoopgesprek_status&where[${whereIdx}][expr]=eq&where[${whereIdx}][val]=${encodeURIComponent(stage)}`);
    whereIdx++;
  }

  if (segment) {
    whereParts.push(`where[${whereIdx}][col]=segment_prioriteit&where[${whereIdx}][expr]=eq&where[${whereIdx}][val]=${encodeURIComponent(segment)}`);
    whereIdx++;
  }

  if (lastActiveAfter) {
    whereParts.push(`where[${whereIdx}][col]=last_active&where[${whereIdx}][expr]=gte&where[${whereIdx}][val]=${encodeURIComponent(lastActiveAfter)}`);
    whereIdx++;
  }

  if (lastActiveBefore) {
    whereParts.push(`where[${whereIdx}][col]=last_active&where[${whereIdx}][expr]=lte&where[${whereIdx}][val]=${encodeURIComponent(lastActiveBefore)}`);
    whereIdx++;
  }

  if (search.trim()) {
    params.set("search", search.trim());
  }

  const queryString = `${params.toString()}${whereParts.length ? "&" + whereParts.join("&") : ""}`;
  const response = await mauticFetch(`/api/contacts?${queryString}`);

  if (!response.ok) {
    console.error("Mautic pipeline zoekfout:", response.status, await response.text());
    return { contacts: [], total: 0 };
  }

  const data = await response.json();
  const rawContacts = data.contacts || {};
  const total = data.total ? parseInt(data.total) : 0;

  const contacts: MauticContactPipeline[] = Object.entries(rawContacts).map(([id, c]) => {
    return mapToPipeline(c as Record<string, unknown>, parseInt(id));
  });

  return { contacts, total };
}

/**
 * Zoek een contact in Mautic op basis van Realworks Rcode (agrcode)
 */
export async function searchContactByRealworksCode(agrcode: string): Promise<MauticContact | null> {
  const query = new URLSearchParams({
    "where[0][col]": "realworks_code",
    "where[0][expr]": "eq",
    "where[0][val]": agrcode,
    limit: "1",
  });

  const response = await mauticFetch(`/api/contacts?${query}`);
  if (!response.ok) {
    console.error("Mautic Rcode zoekfout:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const contacts = data.contacts || {};
  const contactIds = Object.keys(contacts);
  if (contactIds.length === 0) return null;

  const contactId = contactIds[0];
  const contact = contacts[contactId];
  const fields = contact.fields?.all || {};

  return {
    id: parseInt(contactId),
    firstname: fields.firstname || "",
    lastname: fields.lastname || "",
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    company: fields.company || null,
    points: contact.points || 0,
    lastActive: fields.last_active || null,
  };
}

/**
 * Ken punten toe aan een Mautic-contact via het native points-endpoint.
 * Optioneel binnen een Mautic 7 puntgroep via de `group`-query (best-effort:
 * oudere Mautic-versies negeren de parameter en tellen bij het globale totaal).
 * Zo voeden platform-signalen (gesprek, WhatsApp, bezichtiging) Mautic's scoring.
 */
export async function addContactPoints(
  contactId: number,
  points: number,
  group?: number
): Promise<void> {
  if (!points || points <= 0) return;
  const qs = group ? `?group=${group}` : "";
  const response = await mauticFetch(
    `/api/contacts/${contactId}/points/plus/${points}${qs}`,
    { method: "POST" }
  );
  if (!response.ok) {
    console.error(
      "Mautic punten toevoegen mislukt:",
      response.status,
      await response.text()
    );
  }
}

/**
 * Voeg een notitie toe aan een Mautic contact
 */
export async function addMauticNote(
  contactId: number,
  text: string,
  dateTime?: Date | string | null
): Promise<void> {
  const parsedDate = dateTime ? new Date(dateTime) : null;
  const validDateTime =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : undefined;
  const response = await mauticFetch("/api/notes/new", {
    method: "POST",
    body: JSON.stringify({
      lead: contactId,
      text,
      type: "general",
      ...(validDateTime ? { dateTime: validDateTime } : {}),
    }),
  });
  if (!response.ok) {
    console.error("Mautic notitie fout:", response.status, await response.text());
  }
}

export async function addMauticTags(
  contactId: number,
  tags: string[]
): Promise<void> {
  const cleanTags = tags.map((tag) => tag.trim()).filter(Boolean);
  if (!cleanTags.length) return;

  const response = await mauticFetch(`/api/contacts/${contactId}/tags/add`, {
    method: "POST",
    body: JSON.stringify({ tags: cleanTags }),
  });

  if (!response.ok) {
    console.error("Mautic tags toevoegen mislukt:", response.status, await response.text());
  }
}

export interface MauticSegment {
  id: number;
  name: string;
  alias: string | null;
  isPublished: boolean;
  subscriberCount: number | null;
}

export interface MauticEmailSummary {
  id: number;
  name: string;
  subject: string | null;
  isPublished: boolean;
  sentCount: number | null;
  readCount: number | null;
  clickCount: number | null;
  dateSent: string | null;
}

function parseNumberField(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function readFirstNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseNumberField(source[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function mapSegment(raw: Record<string, unknown>, idFallback?: number): MauticSegment {
  const id = parseNumberField(raw.id) ?? idFallback ?? 0;
  return {
    id,
    name: String(raw.name || raw.title || raw.alias || `Segment ${id}`),
    alias: typeof raw.alias === "string" ? raw.alias : null,
    isPublished: raw.isPublished === undefined ? true : Boolean(raw.isPublished),
    subscriberCount: readFirstNumber(raw, ["subscriberCount", "leadCount", "contactCount", "count", "leads"]),
  };
}

export async function listSegments(): Promise<MauticSegment[]> {
  const response = await mauticFetch("/api/segments?limit=200&orderBy=name&orderByDir=asc");

  if (!response.ok) {
    console.error("Mautic segmenten ophalen mislukt:", response.status, await response.text());
    return [];
  }

  const data = await response.json();
  const rawSegments = data.lists || data.segments || {};

  return Object.entries(rawSegments)
    .map(([id, segment]) => mapSegment(segment as Record<string, unknown>, Number(id)))
    .filter((segment) => segment.id > 0);
}

export async function getSegmentSubscriberCount(segmentId: number): Promise<number | null> {
  const response = await mauticFetch(`/api/segments/${segmentId}/contacts?limit=1`);

  if (!response.ok) {
    console.error("Mautic segment-contacten ophalen mislukt:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return parseNumberField(data.total) ?? parseNumberField(data.totalCount) ?? null;
}

export async function createNewsletterEmail(data: {
  name: string;
  subject: string;
  preheader?: string | null;
  segmentIds: number[];
  html: string;
  plainText: string;
}): Promise<{ id: number; url: string | null }> {
  const response = await mauticFetch("/api/emails/new", {
    method: "POST",
    body: JSON.stringify({
      name: data.name,
      subject: data.subject,
      preheaderText: data.preheader || "",
      emailType: "list",
      isPublished: false,
      lists: data.segmentIds,
      customHtml: data.html,
      plainText: data.plainText,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mautic nieuwsbriefconcept aanmaken mislukt: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  const email = result.email || result;
  const id = parseNumberField(email.id) ?? parseNumberField(result.id);
  if (!id) throw new Error("Mautic gaf geen email-id terug voor het nieuwsbriefconcept");

  return {
    id,
    url: `${MAUTIC_URL.replace(/\/$/, "")}/s/emails/view/${id}`,
  };
}

export async function getEmailSummary(emailId: number): Promise<MauticEmailSummary | null> {
  const response = await mauticFetch(`/api/emails/${emailId}`);

  if (!response.ok) {
    console.error("Mautic email ophalen mislukt:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const email = (data.email || data) as Record<string, unknown>;
  const stats = ((email.stats || email.stat || {}) as Record<string, unknown>) || {};

  return {
    id: emailId,
    name: String(email.name || email.internalName || `Email ${emailId}`),
    subject: typeof email.subject === "string" ? email.subject : null,
    isPublished: Boolean(email.isPublished),
    sentCount: readFirstNumber({ ...email, ...stats }, ["sentCount", "sent", "sent_count", "emailsSent"]),
    readCount: readFirstNumber({ ...email, ...stats }, ["readCount", "read", "reads", "openCount", "opened"]),
    clickCount: readFirstNumber({ ...email, ...stats }, ["clickCount", "clicks", "hitCount", "hits"]),
    dateSent:
      typeof email.dateSent === "string"
        ? email.dateSent
        : typeof email.sentDate === "string"
          ? email.sentDate
          : null,
  };
}

/**
 * Maak een buurtdata lead aan of update een bestaand contact in Mautic.
 * Zoekt op e-mailadres, maakt nieuw aan als niet gevonden.
 * Voegt tag "buurtdata-lead" toe en slaat het gezochte adres op als notitie.
 */
export async function upsertBuurtdataLead(data: {
  naam: string;
  email: string;
  telefoon?: string | null;
  adres?: string;
  woningType?: "huidig" | "potentieel" | "anders";
}): Promise<void> {
  const naamParts = data.naam.trim().split(/\s+/);
  const firstname = naamParts[0] || "";
  const lastname = naamParts.slice(1).join(" ") || "";

  // Zoek bestaand contact op e-mailadres
  const searchRes = await mauticFetch(
    `/api/contacts?where[0][col]=email&where[0][expr]=eq&where[0][val]=${encodeURIComponent(data.email)}&limit=1`
  );

  let contactId: number | null = null;

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    const ids = Object.keys(searchData.contacts || {});
    if (ids.length > 0) contactId = parseInt(ids[0]);
  }

  // Segment-tag op basis van woningtype
  const woningTag =
    data.woningType === "huidig"
      ? "buurtdata-eigen-woning"
      : data.woningType === "potentieel"
      ? "buurtdata-potentieel-koper"
      : "buurtdata-overig";

  // kijker_eigen_woning: true = huidige eigenaar (mogelijk verkoper), false = zoeker
  const eigenWoningVal =
    data.woningType === "huidig" ? "1" : data.woningType === "potentieel" ? "0" : null;

  const fields: Record<string, string> = {
    firstname,
    lastname,
    email: data.email,
    kijker_lead_herkomst: "website-buurtdata",
  };
  if (data.telefoon) fields.phone = data.telefoon;
  if (eigenWoningVal !== null) fields.kijker_eigen_woning = eigenWoningVal;

  const tags = ["buurtdata-lead", woningTag];

  if (contactId) {
    await mauticFetch(`/api/contacts/${contactId}/edit`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    await mauticFetch(`/api/contacts/${contactId}/tags/add`, {
      method: "POST",
      body: JSON.stringify({ tags }),
    });
  } else {
    const createRes = await mauticFetch("/api/contacts/new", {
      method: "POST",
      body: JSON.stringify({ ...fields, tags }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      contactId = created.contact?.id ?? null;
    }
  }

  if (contactId && data.adres) {
    const typeLabel =
      data.woningType === "huidig"
        ? "huidige woning"
        : data.woningType === "potentieel"
        ? "potentiële aankoop"
        : "overig";
    await addMauticNote(
      contactId,
      `Buurtrapport aangevraagd voor: ${data.adres} (${typeLabel})`
    );
  }
}

/**
 * Werk contact velden bij in Mautic
 */
export async function updateContact(
  contactId: number,
  data: Record<string, string | number | null>
): Promise<MauticContact | null> {
  const response = await mauticFetch(`/api/contacts/${contactId}/edit`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    console.error("Mautic update fout:", response.status, await response.text());
    return null;
  }

  const result = await response.json();
  const contact = result.contact;
  const fields = contact.fields?.all || {};

  return {
    id: contact.id,
    firstname: fields.firstname || "",
    lastname: fields.lastname || "",
    email: fields.email || null,
    phone: fields.phone || null,
    mobile: fields.mobile || null,
    company: fields.company || null,
    points: contact.points || 0,
    lastActive: fields.last_active || null,
  };
}
