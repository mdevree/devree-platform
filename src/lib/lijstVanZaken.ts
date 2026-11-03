export type ZakenItem = { field: string; label: string; value: string; answer: string; kind: "zaak" | "contract"; attention: boolean };
export type ZakenList = { objectcode: string; systemid: string; version: string; sellerUpdatedAt: string; items: ZakenItem[]; fields: Record<string, string> };
const metadata = new Set(["objectcode", "_systemid", "versienummer", "klanten_intranet_datum_aanpassing"]);

// Preserve only answers, their source masks and custom item descriptions.
// Cookies, CSRF tokens, seller identities and form-control fields never enter storage.
export function normalizeLijstVanZaken(input: unknown): ZakenList {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Formuliervelden ontbreken");
  const raw = input as Record<string, unknown>;
  const allowed = new Set(metadata);
  for (const key of Object.keys(raw)) {
    if (!/^[a-z][a-z0-9_]*__MASK$/.test(key) || /verkoper|select|token|password|cookie|session/i.test(key)) continue;
    const field = key.slice(0, -6);
    allowed.add(key); allowed.add(field);
    if (field.includes("_value_")) allowed.add(field.replace("_value_", "_"));
  }
  const fields: Record<string, string> = {};
  for (const key of allowed) {
    const value = raw[key];
    if (typeof value === "string" && value.length <= 10000) fields[key] = value;
  }
  const objectcode = (fields.objectcode || "").trim();
  if (!/^[A-Za-z0-9-]{1,40}$/.test(objectcode) || !/^\d+$/.test(fields._systemid || "")) throw new Error("Geldige objectcode en lijst-ID zijn verplicht");
  const items: ZakenItem[] = [];
  for (const key of Object.keys(fields).filter(k => k.endsWith("__MASK"))) {
    const field = key.slice(0, -6);
    const value = fields[field] ?? "";
    const custom = field.includes("_value_");
    const label = custom ? (fields[field.replace("_value_", "_")] || "").trim() : field.replaceAll("_", " ");
    // Unnamed optional rows remain in source fields, but are not actual items.
    if (custom && !label) continue;
    const options = fields[key].split("|").map(s => { const i = s.indexOf(";"); return [s.slice(0, i), s.slice(i + 1)]; });
    const answer = value === "" ? "Niet ingevuld" : options.find(([code]) => code === value)?.[1] || `Onbekende keuze (${value})`;
    const kind = field.startsWith("contract_") ? "contract" : "zaak";
    const attention = (kind === "contract" ? ["Ja", "Gaat mee", "Moet worden overgenomen"].includes(answer) : /gaat mee|overgenomen/i.test(answer) || (custom && answer === "Blijft achter"));
    items.push({ field, label, value, answer, kind, attention });
  }
  if (!items.length) throw new Error("Geen antwoorden met keuzebetekenissen ontvangen");
  return { objectcode, systemid: fields._systemid, version: fields.versienummer || "", sellerUpdatedAt: fields.klanten_intranet_datum_aanpassing || "", items, fields };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]!));
export function renderZakenBriefing(list: ZakenList | null, receivedAt?: string): string {
  if (!list) return "";
  const items = list.items.filter(i => i.attention);
  return `<section style="break-before:page;font-family:Arial,sans-serif;font-size:12px"><h2>Bijzonderheden uit de lijst van zaken</h2><p>Bron: Realworks lijst ${escapeHtml(list.systemid)}, object ${escapeHtml(list.objectcode)}. Ontvangen: ${escapeHtml(receivedAt || "onbekend")}. Dit is een overzicht van ingevulde antwoorden; controleer de actuele lijst bij twijfel.</p>${items.length ? `<ul>${items.map(i => `<li style="margin-bottom:8px;break-inside:avoid"><strong>${escapeHtml(i.label)}</strong>: ${escapeHtml(i.answer)}</li>`).join("")}</ul>` : "<p>Geen afwijkingen geselecteerd voor dit overzicht.</p>"}</section>`;
}
