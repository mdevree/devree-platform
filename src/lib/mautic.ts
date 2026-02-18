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
      financiering: fields.interesse_financiering !== undefined ? Number(fields.interesse_financiering) : null,
      duurzaamheid: fields.interesse_duurzaamheid !== undefined ? Number(fields.interesse_duurzaamheid) : null,
      verbouwing: fields.interesse_verbouwing !== undefined ? Number(fields.interesse_verbouwing) : null,
      investeren: fields.interesse_investeren !== undefined ? Number(fields.interesse_investeren) : null,
      starters: fields.interesse_starters !== undefined ? Number(fields.interesse_starters) : null,
    },
    bezichtigingInteresse: fields.bezichtiging_interesse !== undefined ? Number(fields.bezichtiging_interesse) : null,
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
  start?: number;
  limit?: number;
  orderBy?: string;
  orderByDir?: "asc" | "desc";
} = {}): Promise<{ contacts: MauticContactPipeline[]; total: number }> {
  const {
    search = "",
    stage,
    segment,
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
