export type Photo = {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  label: string;
};
export type Slot = { id: number | null; x: number; y: number; zoom: number };
export type Source = {
  code: string;
  street: string;
  city: string;
  status: string;
  description: string;
  websitePrice: number | null;
  projectPrice: number | null;
  condition: string;
  priceLabel: string;
  delivery: string;
  mediaKey: string;
};
export type Draft = {
  source: Source;
  priceSource: "website" | "project" | null;
  text: string;
  slots: Slot[];
};
export type Sheet = "set" | "voorblad" | "fotoblad-1" | "fotoblad-2";
export const sheets: Record<Sheet, string> = {
  set: "Complete set",
  voorblad: "Voorblad",
  "fotoblad-1": "Fotoblad 1",
  "fotoblad-2": "Fotoblad 2",
};
export const price = (n: number | null) =>
  n === null ? "onbekend" : "€ " + n.toLocaleString("nl-NL");
export const slot = (id: number | null): Slot => ({
  id,
  x: 50,
  y: 50,
  zoom: 1,
});
export const hasCover = (sheet: Sheet) =>
  sheet === "set" || sheet === "voorblad";
export function indices(sheet: Sheet) {
  const start = sheet === "fotoblad-2" ? 7 : sheet === "fotoblad-1" ? 1 : 0;
  const count = sheet === "set" ? 13 : sheet === "voorblad" ? 1 : 6;
  return Array.from({ length: count }, (_, i) => i + start);
}
export function priceChoice(s: Source): Draft["priceSource"] {
  if (
    s.websitePrice !== null &&
    s.projectPrice !== null &&
    s.websitePrice !== s.projectPrice
  )
    return null;
  return s.websitePrice !== null
    ? "website"
    : s.projectPrice !== null
      ? "project"
      : null;
}
export function chosenPrice(d: Draft) {
  return d.priceSource === "website"
    ? d.source.websitePrice
    : d.priceSource === "project"
      ? d.source.projectPrice
      : null;
}
export function suggestSlots(
  photos: Photo[],
  heroId: number | undefined,
): Slot[] {
  const preferred = photos.filter(
    (p) => !/plattegrond|floorplan|grondplan/i.test(p.label),
  );
  const hero = photos.find((p) => p.id === heroId) || preferred[0] || photos[0];
  const others = preferred.filter((p) => p.id !== hero?.id);
  const count = Math.min(12, others.length);
  const ids = Array.from(
    { length: count },
    (_, i) => others[Math.floor((i * others.length) / count)].id,
  );
  return [
    slot(hero?.id ?? null),
    ...Array.from({ length: 12 }, (_, i) => slot(ids[i] ?? null)),
  ];
}
export function effectivePpi(p: Photo, s: Slot, cover: boolean) {
  const width = cover ? 481 : 256,
    height = cover ? 321 : 192;
  return Math.round(
    (72 * Math.min(p.width / width, p.height / height)) / s.zoom,
  );
}
export function imageStyle(p: Photo, s: Slot, cover: boolean) {
  const ratio = cover ? 481 / 321 : 256 / 192;
  const width = 100 * Math.max(1, p.width / p.height / ratio) * s.zoom;
  const height = 100 * Math.max(1, (ratio * p.height) / p.width) * s.zoom;
  return {
    width: width + "%",
    height: height + "%",
    left: ((100 - width) * s.x) / 100 + "%",
    top: ((100 - height) * s.y) / 100 + "%",
  };
}
export const groups = {
  adres: ["street", "city"],
  prijs: ["websitePrice", "projectPrice", "condition", "priceLabel"],
  oplevering: ["delivery"],
  status: ["status"],
  tekst: ["description"],
  "foto’s": ["mediaKey"],
} as const;
export type Group = keyof typeof groups;
export function changedGroups(old: Source, current: Source) {
  return (Object.keys(groups) as Group[]).filter((g) =>
    groups[g].some((key) => old[key] !== current[key]),
  );
}
export function adopt(
  d: Draft,
  current: Source,
  group: Group,
  suggestion: string,
): Draft {
  const changes = Object.fromEntries(groups[group].map((k) => [k, current[k]]));
  return {
    ...d,
    source: { ...d.source, ...changes },
    priceSource: group === "prijs" ? priceChoice(current) : d.priceSource,
    text: group === "tekst" ? suggestion : d.text,
  };
}
export function validateSheet(d: Draft, photos: Photo[], sheet: Sheet) {
  if (hasCover(sheet)) {
    if (
      !d.source.street ||
      !d.source.city ||
      !d.text.trim() ||
      !d.source.delivery ||
      !d.source.condition
    )
      return "Vul adres, plaats, verkooptekst, koopconditie en oplevering aan voor het voorblad.";
    if (chosenPrice(d) === null) return "Kies de vraagprijs voor het voorblad.";
  }
  const missing = indices(sheet).filter(
    (i) => !photos.some((p) => p.id === d.slots[i]?.id),
  );
  return missing.length
    ? "Kies een beschikbare foto voor " +
        missing.map((i) => (i ? "fotovak " + i : "de hoofdfoto")).join(", ") +
        "."
    : "";
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function between(v: unknown, min: number, max: number) {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
export function isDraft(v: unknown): v is Draft {
  if (
    !record(v) ||
    !record(v.source) ||
    !Array.isArray(v.slots) ||
    v.slots.length !== 13
  )
    return false;
  const s = v.source;
  const strings = [
    "code",
    "street",
    "city",
    "status",
    "description",
    "condition",
    "priceLabel",
    "delivery",
    "mediaKey",
  ];
  return (
    strings.every(
      (k) =>
        typeof s[k] === "string" &&
        (s[k] as string).length <= (k === "description" ? 60000 : 500),
    ) &&
    ["websitePrice", "projectPrice"].every(
      (k) =>
        s[k] === null || (Number.isSafeInteger(s[k]) && between(s[k], 0, 1e12)),
    ) &&
    (v.priceSource === null ||
      v.priceSource === "website" ||
      v.priceSource === "project") &&
    typeof v.text === "string" &&
    v.text.length <= 16000 &&
    v.slots.every(
      (t) =>
        record(t) &&
        (t.id === null ||
          (Number.isSafeInteger(t.id) &&
            between(t.id, 1, Number.MAX_SAFE_INTEGER))) &&
        between(t.x, 0, 100) &&
        between(t.y, 0, 100) &&
        between(t.zoom, 1, 3),
    )
  );
}
