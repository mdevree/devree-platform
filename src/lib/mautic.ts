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
