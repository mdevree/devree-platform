// Centrale constanten voor projecttypen en statusflows
// Gebruik deze constanten in zowel API als UI voor consistentie

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  VERKOOP: "Verkoop",
  AANKOOP: "Aankoop",
  TAXATIE: "Taxatie",
};

export const PROJECT_TYPE_COLORS: Record<string, string> = {
  VERKOOP: "bg-blue-100 text-blue-700 border-blue-200",
  AANKOOP: "bg-green-100 text-green-700 border-green-200",
  TAXATIE: "bg-purple-100 text-purple-700 border-purple-200",
};

export const PROJECT_TYPE_DOT_COLORS: Record<string, string> = {
  VERKOOP: "bg-blue-500",
  AANKOOP: "bg-green-500",
  TAXATIE: "bg-purple-500",
};

// Statusflows per projecttype (in volgorde)
export const STATUS_FLOW: Record<string, string[]> = {
  VERKOOP: [
    "LEAD",
    "GESPREK_GEPLAND",
    "OFFERTE_VERSTUURD",
    "OTD_VERSTUURD",
    "OTD_ONDERTEKEND",
    "ACTIEF",
    "LIVE_FUNDA",
    "ONDER_BOD",
    "KOOPAKTE",
    "GEPASSEERD",
    "AFGEROND",
  ],
  AANKOOP: [
    "LEAD",
    "GESPREK_GEPLAND",
    "OTD_VERSTUURD",
    "OTD_ONDERTEKEND",
    "ACTIEF",
    "KOOPAKTE",
    "GEPASSEERD",
    "AFGEROND",
  ],
  TAXATIE: [
    "LEAD",
    "OTD_VERSTUURD",
    "OTD_ONDERTEKEND",
    "ACTIEF",
    "RAPPORT_CONCEPT",
    "AFGEROND",
  ],
};

export const STATUS_LABELS: Record<string, string> = {
  LEAD: "Lead",
  GESPREK_GEPLAND: "Gesprek gepland",
  OFFERTE_VERSTUURD: "Offerte verstuurd",
  OTD_VERSTUURD: "OTD verstuurd",
  OTD_ONDERTEKEND: "OTD ondertekend",
  ACTIEF: "Actief",
  LIVE_FUNDA: "Live op Funda",
  ONDER_BOD: "Onder bod",
  KOOPAKTE: "Koopakte",
  GEPASSEERD: "Gepasseerd",
  AFGEROND: "Afgerond",
  GEANNULEERD: "Geannuleerd",
  RAPPORT_CONCEPT: "Rapport concept",
};

export const STATUS_COLORS: Record<string, string> = {
  LEAD: "bg-gray-100 text-gray-600",
  GESPREK_GEPLAND: "bg-yellow-100 text-yellow-700",
  OFFERTE_VERSTUURD: "bg-orange-100 text-orange-700",
  OTD_VERSTUURD: "bg-blue-100 text-blue-700",
  OTD_ONDERTEKEND: "bg-blue-200 text-blue-800",
  ACTIEF: "bg-indigo-100 text-indigo-700",
  LIVE_FUNDA: "bg-violet-100 text-violet-700",
  ONDER_BOD: "bg-amber-100 text-amber-700",
  KOOPAKTE: "bg-lime-100 text-lime-700",
  GEPASSEERD: "bg-green-200 text-green-800",
  AFGEROND: "bg-green-100 text-green-700",
  GEANNULEERD: "bg-red-100 text-red-600",
  RAPPORT_CONCEPT: "bg-teal-100 text-teal-700",
};

// OTD-gerelateerde statussen (voor badges in pipeline)
export const OTD_STATUSES = [
  "OTD_VERSTUURD",
  "OTD_ONDERTEKEND",
];

// Actieve statussen (filter "Actief")
export const ACTIVE_STATUSES = [
  "GESPREK_GEPLAND",
  "OFFERTE_VERSTUURD",
  "OTD_VERSTUURD",
  "OTD_ONDERTEKEND",
  "ACTIEF",
  "LIVE_FUNDA",
  "ONDER_BOD",
  "KOOPAKTE",
  "GEPASSEERD",
  "RAPPORT_CONCEPT",
];

// Afgeronde statussen
export const TERMINAL_STATUSES = ["AFGEROND", "GEANNULEERD"];

export const VERKOOPMETHODE_LABELS: Record<string, string> = {
  INSCHRIJVING_MET_BIEDTERMIJN: "Inschrijving met biedtermijn",
  GESLOTEN_INSCHRIJVING_MET_BIEDTERMIJN: "Gesloten inschrijving met biedtermijn",
  OPEN_VEILING_MET_BIEDTERMIJN: "Open veiling met biedtermijn",
  BIEDEN_ZONDER_BIEDTERMIJN: "Bieden zonder biedtermijn",
};

export const VERKOOPSTART_LABELS: Record<string, string> = {
  DIRECT: "Direct na ondertekening",
  UITGESTELD: "Uitgesteld (startdatum)",
  SLAPEND: "Slapende opdracht",
};

// Pipeline kolommen per type — labels komen uit STATUS_LABELS
export const PIPELINE_STAGES_VERKOOP: string[] = [
  "LEAD",
  "GESPREK_GEPLAND",
  "OFFERTE_VERSTUURD",
  "OTD_VERSTUURD",
  "OTD_ONDERTEKEND",
  "ACTIEF",
  "LIVE_FUNDA",
  "ONDER_BOD",
  "KOOPAKTE",
  "GEPASSEERD",
];

export const PIPELINE_STAGES_AANKOOP: string[] = [
  "LEAD",
  "GESPREK_GEPLAND",
  "OTD_VERSTUURD",
  "OTD_ONDERTEKEND",
  "ACTIEF",
  "KOOPAKTE",
  "GEPASSEERD",
];

export const PIPELINE_STAGES_TAXATIE: string[] = [
  "LEAD",
  "OTD_VERSTUURD",
  "OTD_ONDERTEKEND",
  "ACTIEF",
  "RAPPORT_CONCEPT",
  "AFGEROND",
];
