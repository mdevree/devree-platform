export const listingTypes = {
  garage: "Garage of garagebox",
  parking: "Parkeerplaats",
  house: "Woonhuis",
  apartment: "Appartement",
} as const;

export type ListingType = keyof typeof listingTypes;
export const reviewEmail = "melvin@devreemakelaardij.nl";

export function listingType(
  kind: string | null,
  subtype: string | null,
): ListingType | null {
  const main = kind?.trim().toLowerCase();
  const sub = subtype?.trim().toLowerCase();
  if (main === "woonhuis") return "house";
  if (main === "appartement") return "apartment";
  const type =
    main === "overigog" || main === "parkeergelegenheid" ? sub : main;
  if (type && ["garage", "garagebox", "garageboxen"].includes(type))
    return "garage";
  if (
    type &&
    ["parkeerplaats", "parkeerplaatsen", "parkeerkelder"].includes(type)
  )
    return "parking";
  return null;
}

export function withinRadius(
  center: { x: number; y: number },
  point: { x: number; y: number },
  meters: number,
) {
  return Math.hypot(center.x - point.x, center.y - point.y) <= meters;
}

export function validDraftId(value: string | null): value is string {
  return !!value && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

export function draftReviewPath(id: string) {
  return "/digitale-medewerker?tab=concepten&draft=" + encodeURIComponent(id) + "#concept-" + encodeURIComponent(id);
}
