export const CONTACT_V1_VERSION = "ContactV1" as const;

export const CONTACT_V1_FIELDS = [
  "contractVersion",
  "source",
  "mauticContactId",
  "aanhef",
  "initialen",
  "voornamen",
  "voornaam",
  "tussenvoegsel",
  "achternaam",
  "email",
  "mobiel",
  "telefoon",
  "straat",
  "huisnummer",
  "toevoeging",
  "aanvullendeAdresregel",
  "postcode",
  "plaats",
  "land",
  "partner",
  "normalizationWarnings",
] as const;

export const CONTACT_V1_PARTNER_FIELDS = [
  "mauticContactId",
  "aanhef",
  "initialen",
  "voornamen",
  "voornaam",
  "tussenvoegsel",
  "achternaam",
  "email",
  "mobiel",
  "telefoon",
] as const;

export type ContactV1Field = (typeof CONTACT_V1_FIELDS)[number];
export type ContactV1PartnerField = (typeof CONTACT_V1_PARTNER_FIELDS)[number];

export type ContactV1WarningCode =
  | "missing_house_number"
  | "parsed_address1"
  | "unparseable_address"
  | "foreign_postcode"
  | "duplicate_address2"
  | "partner_present";

export type ContactV1NormalizationWarning = {
  code: ContactV1WarningCode;
  field: ContactV1Field | null;
  message: string;
};

export type ContactV1Partner = {
  mauticContactId: number | null;
  aanhef: string | null;
  initialen: string | null;
  voornamen: string | null;
  voornaam: string | null;
  tussenvoegsel: string | null;
  achternaam: string | null;
  email: string | null;
  mobiel: string | null;
  telefoon: string | null;
};

export type ContactV1 = {
  contractVersion: typeof CONTACT_V1_VERSION;
  source: "mautic";
  mauticContactId: number;
  aanhef: string | null;
  initialen: string | null;
  voornamen: string | null;
  voornaam: string | null;
  tussenvoegsel: string | null;
  achternaam: string;
  email: string | null;
  mobiel: string | null;
  telefoon: string | null;
  straat: string | null;
  huisnummer: string | null;
  toevoeging: string | null;
  aanvullendeAdresregel: string | null;
  postcode: string | null;
  plaats: string | null;
  land: string | null;
  partner: ContactV1Partner | null;
  normalizationWarnings: ContactV1NormalizationWarning[];
};
