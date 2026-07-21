import type { ContactV1, ContactV1NormalizationWarning } from "./contracts/contactV1";

export type MauticContactV1Input = {
  id: number | string;
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  aanhef?: string | null;
  initialen?: string | null;
  voornamen?: string | null;
  huisnummer?: string | null;
  huisnummer_toevoeging?: string | null;
};

type ParsedAddress = {
  straat: string | null;
  huisnummer: string | null;
  toevoeging: string | null;
  parsed: boolean;
};

export function normalizeMauticContactToContactV1(input: MauticContactV1Input): ContactV1 {
  const warnings: ContactV1NormalizationWarning[] = [];
  const land = normalizeCountry(input.country);
  const postcode = normalizePostcode(input.zipcode, land, warnings);
  const plaats = clean(input.city);
  const explicitHouseNumber = clean(input.huisnummer);
  const explicitAddition = clean(input.huisnummer_toevoeging);
  const address1 = clean(input.address1);
  const address2 = clean(input.address2);

  const parsedAddress = explicitHouseNumber
    ? { straat: address1, huisnummer: explicitHouseNumber, toevoeging: explicitAddition, parsed: false }
    : parseAddress1(address1);

  if (!explicitHouseNumber && parsedAddress.parsed) {
    warnings.push({
      code: "parsed_address1",
      field: "straat",
      message: "Straat, huisnummer en toevoeging zijn uit address1 afgeleid.",
    });
  }

  if (!parsedAddress.huisnummer) {
    warnings.push({
      code: address1 ? "unparseable_address" : "missing_house_number",
      field: "huisnummer",
      message: address1
        ? "Geen betrouwbaar huisnummer uit address1 afgeleid."
        : "Mautic bevat geen apart huisnummer.",
    });
  }

  return {
    contractVersion: "ContactV1",
    source: "mautic",
    mauticContactId: Number(input.id),
    aanhef: clean(input.aanhef),
    initialen: clean(input.initialen) ?? initialsFromFirstName(input.firstname),
    voornamen: clean(input.voornamen) ?? clean(input.firstname),
    voornaam: firstName(input.firstname),
    tussenvoegsel: lastNameParts(input.lastname).tussenvoegsel,
    achternaam: lastNameParts(input.lastname).achternaam,
    email: clean(input.email),
    mobiel: clean(input.mobile),
    telefoon: clean(input.phone),
    straat: parsedAddress.straat,
    huisnummer: parsedAddress.huisnummer,
    toevoeging: parsedAddress.toevoeging,
    aanvullendeAdresregel: normalizeAddress2(address2, postcode, plaats, warnings),
    postcode,
    plaats,
    land,
    partner: null,
    normalizationWarnings: warnings,
  };
}

function clean(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

function normalizeCountry(value: string | null | undefined): string | null {
  const country = clean(value);
  if (!country) return null;

  const lower = country.toLowerCase();
  if (["nl", "nederland", "netherlands", "the netherlands"].includes(lower)) {
    return "Nederland";
  }

  return country;
}

function normalizePostcode(
  value: string | null | undefined,
  land: string | null,
  warnings: ContactV1NormalizationWarning[]
): string | null {
  const postcode = clean(value);
  if (!postcode) return null;

  if (land && land !== "Nederland") {
    warnings.push({
      code: "foreign_postcode",
      field: "postcode",
      message: "Postcode is niet als Nederlandse postcode genormaliseerd.",
    });
    return postcode.toUpperCase();
  }

  const match = postcode.replace(/\s+/g, "").toUpperCase().match(/^([1-9][0-9]{3})([A-Z]{2})$/);
  if (!match) return postcode.toUpperCase();

  return `${match[1]} ${match[2]}`;
}

function parseAddress1(address1: string | null): ParsedAddress {
  if (!address1) {
    return { straat: null, huisnummer: null, toevoeging: null, parsed: false };
  }

  if (/^postbus\b/i.test(address1)) {
    return { straat: address1, huisnummer: null, toevoeging: null, parsed: false };
  }

  const match = address1.match(/^(.+?)\s+([0-9]+)([A-Za-z])?(?:\s*([-/]\s*[0-9A-Za-z]+|bis))?$/i);
  if (!match) {
    return { straat: address1, huisnummer: null, toevoeging: null, parsed: false };
  }

  const toevoeging = clean([match[3], match[4]?.replace(/\s+/g, "")].filter(Boolean).join("")) ?? null;

  return {
    straat: clean(match[1]),
    huisnummer: match[2],
    toevoeging,
    parsed: true,
  };
}

function normalizeAddress2(
  address2: string | null,
  postcode: string | null,
  plaats: string | null,
  warnings: ContactV1NormalizationWarning[]
): string | null {
  if (!address2) return null;

  const normalizedAddress2 = normalizeComparable(address2);
  const postcodePlaats = normalizeComparable([postcode, plaats].filter(Boolean).join(" "));
  const plaatsPostcode = normalizeComparable([plaats, postcode].filter(Boolean).join(" "));

  if (normalizedAddress2 === postcodePlaats || normalizedAddress2 === plaatsPostcode) {
    warnings.push({
      code: "duplicate_address2",
      field: "aanvullendeAdresregel",
      message: "address2 is genegeerd omdat het postcode en plaats dupliceert.",
    });
    return null;
  }

  return address2;
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function initialsFromFirstName(value: string | null | undefined): string | null {
  const firstNames = clean(value);
  if (!firstNames) return null;

  return firstNames
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}.`)
    .join("");
}

function firstName(value: string | null | undefined): string | null {
  return clean(value)?.split(" ")[0] ?? null;
}

function lastNameParts(value: string | null | undefined): { tussenvoegsel: string | null; achternaam: string } {
  const lastName = clean(value) ?? "";
  const parts = lastName.split(" ").filter(Boolean);
  const tussenvoegsels = new Set(["van", "de", "den", "der", "het", "ter", "te", "ten"]);
  const prefix: string[] = [];

  while (parts.length > 1 && tussenvoegsels.has(parts[0].toLowerCase())) {
    prefix.push(parts.shift() as string);
  }

  return {
    tussenvoegsel: prefix.length > 0 ? prefix.join(" ") : null,
    achternaam: parts.join(" ") || lastName,
  };
}
