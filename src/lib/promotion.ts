export const FUNDA = { BRONS: "Brons", ZILVER: "Zilver", GOUD: "Goud" } as const;
export const PHOTOGRAPHY = { BASIS: "Basis", COMPLEET: "Compleet", COMPLEET_PLUS: "Compleet+" } as const;
export type Funda = keyof typeof FUNDA;
export type Photography = keyof typeof PHOTOGRAPHY;
export const PHOTO_FEATURES: Record<Photography, string[]> = {
  BASIS: ["Vastgoedfotografie", "3D-laserscan", "2D-plattegrond", "Meetrapport"],
  COMPLEET: ["Alles uit Basis", "Buurtfotografie (tot 300 m)", "360°-tour", "Woningvideo"],
  COMPLEET_PLUS: ["Alles uit Compleet", "3D-plattegrond"],
};
export const SURCHARGE = "*Fotografietarieven gelden tot en met 150 m². Voor grotere woningen rekent de fotograaf € 1,50 inclusief btw per extra m² boven 150 m², tot maximaal 400 m². Boven 400 m² loopt de toeslag niet verder op. Deze eventuele toeslag is niet inbegrepen in het getoonde totaal.";
export const RATES = {
  version: "2026-09-11", market: "KOOP" as "KOOP" | "HUUR", footnote: SURCHARGE,
  funda: { BRONS: 27900, ZILVER: 44900, GOUD: 64900 },
  photography: { BASIS: 30000, COMPLEET: 42500, COMPLEET_PLUS: 45000 },
};
export const RENT_RATES = { ...RATES, market: "HUUR" as const, funda: { BRONS: 5900, ZILVER: 7900, GOUD: 10900 } };
export type Promotion = {
  rates: typeof RATES; funda: Funda; photography: Photography;
  fundaCents: number; photographyCents: number; totalCents: number;
};
export function calculatePromotion(rates: typeof RATES, funda: unknown, photography: unknown): Promotion {
  if (typeof funda !== "string" || !Object.hasOwn(FUNDA, funda) || typeof photography !== "string" || !Object.hasOwn(PHOTOGRAPHY, photography)) throw new Error("Kies een geldig Funda- en fotografiepakket.");
  if (funda !== "BRONS" && photography === "BASIS") throw new Error("Bij Funda Zilver en Goud kiest u fotografie Compleet of Compleet+.");
  const f = funda as Funda, p = photography as Photography;
  const fundaCents = rates.funda[f], photographyCents = rates.photography[p];
  if (![fundaCents, photographyCents].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Ongeldige pakkettarieven.");
  return { rates, funda: f, photography: p, fundaCents, photographyCents, totalCents: fundaCents + photographyCents };
}
export function readPromotion(value: unknown): Promotion | null {
  if (value == null) return null;
  const p = value as Promotion;
  return calculatePromotion(p.rates, p.funda, p.photography);
}
export function newPromotion(value?: unknown): Promotion {
  const previous = readPromotion(value);
  return calculatePromotion(RATES, previous?.funda ?? "ZILVER", previous?.photography ?? "COMPLEET");
}
export function submittedPromotion(value: unknown, body: { funda?: unknown; photography?: unknown }): Promotion | null {
  const saved = readPromotion(value);
  return saved ? calculatePromotion(saved.rates, body.funda, body.photography) : null;
}
export function money(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(cents / 100);
}
export function promotionLines(p: Promotion): [string, string][] {
  return [[`Funda ${FUNDA[p.funda]} (1 jaar)`, money(p.fundaCents)], [`Fotografie ${PHOTOGRAPHY[p.photography]}`, money(p.photographyCents)], ["Totale promotiekosten*", money(p.totalCents)], ["Btw", "Alle bedragen inclusief btw"], ["Toeslag", p.rates.footnote]];
}
