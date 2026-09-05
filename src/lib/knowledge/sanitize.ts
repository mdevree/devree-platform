const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+31|0)[\s()-]*(?:\d[\s()-]*){8,10}(?!\d)/g;
const POSTCODE_HOUSE = /\b(\d{4}\s?[A-Z]{2})\s+\d+[A-Z0-9/-]*\b/gi;
const VALIDATION_ID = /\b(?:T|SE)\d{5,}\b/gi;

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeForExternal(value: string): string {
  return normalizeText(value)
    .replace(EMAIL, "[e-mail verwijderd]")
    .replace(PHONE, "[telefoon verwijderd]")
    .replace(POSTCODE_HOUSE, "$1 [huisnummer verwijderd]")
    .replace(VALIDATION_ID, "[dossier-id verwijderd]");
}

export function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 160);
}
