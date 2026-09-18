export type PbxConfig = {
  version: number; mode: "available" | "away"; awayUntil: string | null;
  closedDates: string[]; ownerId: string | null;
};
export const defaultPbxConfig: PbxConfig = { version: 1, mode: "available", awayUntil: null, closedDates: [], ownerId: null };
export const CALLBACK_TEXT = "Bedankt voor uw terugbelverzoek aan De Vree Makelaardij. We hebben uw verzoek ontvangen en nemen contact met u op. U kunt hier alvast aanvullende informatie doorgeven, zoals het adres van de woning waarover u belt.";
export const VIEWING_TEXT = "Bedankt voor uw telefoontje naar De Vree Makelaardij.\n\nVia onderstaande link kunt u ons woningaanbod bekijken en bij de betreffende woning een bezichtiging aanvragen:\nhttps://www.devreemakelaardij.nl/aanbod/\n\nWij nemen daarna contact met u op om de afspraak in te plannen. Heeft u een vraag? Reageer gerust op dit bericht.";
export function normalizePbxPhone(value: unknown): string | null {
  if (typeof value !== "string" || !/^[+\d\s().-]+$/.test(value)) return null;
  let s = value.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  else if (/^0[1-9]\d{8}$/.test(s)) s = "+31" + s.slice(1);
  else if (/^31[1-9]\d{8}$/.test(s)) s = "+" + s;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith("+31") && !/^\+31[1-9]\d{8}$/.test(s)) return null;
  return s;
}
const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function localParts(date: Date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, minute: Number(p.hour) * 60 + Number(p.minute), weekday: new Date(day + "T12:00:00Z").getUTCDay() };
}
export function hours(weekday: number): [number, number] | null {
  return weekday === 0 ? null : weekday === 6 ? [600, 780] : [540, 1050];
}
export function effectiveMode(config: PbxConfig, now = new Date()) {
  const p = localParts(now), h = hours(p.weekday);
  if (!h || config.closedDates.includes(p.day) || p.minute < h[0] || p.minute >= h[1]) return "closed";
  return config.mode === "away" && config.awayUntil && Date.parse(config.awayUntil) > now.getTime() ? "away" : "available";
}
function amsterdamTime(day: string, minutes: number) {
  const desired = Date.parse(day + "T00:00:00Z") + minutes * 60000;
  let t = desired;
  for (let n = 0; n < 3; n++) {
    const p = localParts(new Date(t));
    t += desired - (Date.parse(p.day + "T00:00:00Z") + p.minute * 60000);
  }
  return new Date(t);
}
export function callbackDue(received: Date, closedDates: string[] = []) {
  const start = localParts(received);
  for (let n = 0; n < 370; n++) {
    const day = new Date(Date.parse(start.day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    const h = hours(new Date(day + "T12:00:00Z").getUTCDay());
    if (h && !closedDates.includes(day) && (n > 0 || start.minute < h[1])) return amsterdamTime(day, h[1]);
  }
  throw new Error("Geen openingsdag gevonden");
}
export type PbxEventInput = { eventId: string; callId: string; revision: number; kind: "callback" | "viewing" | "missed"; phone: string | null; receivedAt: string; consentAt: string | null };
export function parsePbxEvent(raw: unknown): PbxEventInput {
  if (!raw || typeof raw !== "object") throw new Error("Ongeldige gebeurtenis");
  const v = raw as Record<string, unknown>;
  if (typeof v.callId !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(v.callId) || typeof v.eventId !== "string" || !/^[a-zA-Z0-9_.:-]{1,150}$/.test(v.eventId)) throw new Error("Ongeldig gebeurtenis-ID");
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1 || Number(v.revision) > 1000) throw new Error("Ongeldige revisie");
  if (!["callback", "viewing", "missed"].includes(String(v.kind))) throw new Error("Ongeldige keuze");
  if (typeof v.receivedAt !== "string" || !Number.isFinite(Date.parse(v.receivedAt))) throw new Error("Ongeldige ontvangstdatum");
  if (v.consentAt != null && (typeof v.consentAt !== "string" || !Number.isFinite(Date.parse(v.consentAt)))) throw new Error("Ongeldige toestemming");
  const phone = v.phone == null ? null : normalizePbxPhone(v.phone);
  if (v.phone != null && !phone) throw new Error("Ongeldig telefoonnummer");
  if (v.consentAt && (!phone || v.kind === "missed")) throw new Error("Toestemming zonder geldig verzoek");
  return { eventId: v.eventId, callId: v.callId, revision: Number(v.revision), kind: v.kind as PbxEventInput["kind"], phone, receivedAt: v.receivedAt, consentAt: v.consentAt as string | null ?? null };
}
export function sendingAllowed(phone: string, mode: string | undefined, testNumbers: string | undefined) {
  return mode === "live" || (mode === "test" && (testNumbers ?? "").split(",").map(normalizePbxPhone).includes(phone));
}
export function validateConfig(input: unknown, previous: PbxConfig): PbxConfig {
  const v = input as Partial<PbxConfig>;
  if (!v || !["available", "away"].includes(v.mode ?? "")) throw new Error("Kies een geldige stand");
  const until = v.mode === "away" ? v.awayUntil : null;
  if (v.mode === "away" && (!until || !Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now())) throw new Error("Kies een eindtijd in de toekomst");
  const days = v.closedDates ?? previous.closedDates;
  if (!Array.isArray(days) || days.length > 366 || days.some(d => typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d+"T12:00:00Z").toISOString().slice(0,10) !== d)) throw new Error("Ongeldige sluitingsdagen");
  return { ...previous, version: previous.version + 1, mode: v.mode!, awayUntil: until ?? null, closedDates: days, ownerId: v.ownerId === undefined ? previous.ownerId : v.ownerId };
}
