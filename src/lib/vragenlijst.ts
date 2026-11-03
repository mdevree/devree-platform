import labels2023 from "@/lib/realworks/vragenlijst-woonhuis-2023.json";
export type QuestionItem = { field: string; number: string; section: string; question: string; label: string; answer: string; value: string; choice: boolean; labelKnown: boolean };
export type QuestionList = { objectcode: string; systemid: string; version: string; sellerUpdatedAt: string; items: QuestionItem[]; fields: Record<string, string>; highlights: { number: string; question: string; answers: QuestionItem[] }[]; labelsComplete: boolean };
const metadata = new Set(["vllisnr", "_systemid", "versienummer", "lijstcode", "vllastupd", "changedbycustomer"]);
export function normalizeVragenlijst(input: unknown): QuestionList {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Formuliervelden ontbreken");
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    // Only property questions (part B), not private seller questions (part A).
    if ((metadata.has(key) || /^answer_\d+(?:__MASK)?$/.test(key)) && typeof value === "string" && value.length <= 10000) fields[key] = value;
  }
  const objectcode = (fields.vllisnr || "").trim();
  if (!/^[A-Za-z0-9-]{1,40}$/.test(objectcode) || !/^\d+$/.test(fields._systemid || "")) throw new Error("Geldige objectcode en vragenlijst-ID zijn verplicht");
  const labels: Record<string, { number: string; section: string; question: string; label: string }> = fields.versienummer === "2023" ? labels2023 : {};
  const items: QuestionItem[] = Object.keys(fields).filter(k => /^answer_\d+$/.test(k)).map(field => {
    const value = fields[field];
    const mask = fields[`${field}__MASK`];
    const choices = mask?.split("|").map(s => { const i = s.indexOf(";"); return [s.slice(0, i), s.slice(i + 1)]; });
    const answer = value === "" ? "Niet beantwoord" : mask ? choices?.find(([code]) => code === value)?.[1] || `Onbekende keuze (${value})` : value;
    return { field, ...(labels[field] || { number: "", section: "", question: "Vraagtekst nog niet gekoppeld", label: "Antwoord zonder gekoppelde vraagtekst" }), answer, value, choice: !!mask, labelKnown: !!labels[field] };
  });
  if (!items.length) throw new Error("Geen woningvragen ontvangen");
  items.sort((a, b) => a.number.localeCompare(b.number, "nl", { numeric: true }));
  const groups = new Map<string, QuestionItem[]>();
  for (const item of items.filter(i => i.labelKnown)) groups.set(item.number, [...(groups.get(item.number) || []), item]);
  const risk = /gebrek|lekk|vocht|schimmel|asbest|verontreinig|geschil|scheur|overlast|verzak|huur|lease|erfdienst|aanschrijving|illegaal|beschadig|beslag|beperking|recht van|vergunning/i;
  const noteworthy = /vocht|schimmel|schade|geen ventilatiebox|geen idee|nooit|vervangen|tuinhuis|overkapping/i;
  const highlights = [...groups.entries()].filter(([, group]) => group.some(i =>
    (i.choice && risk.test(i.question) && ["Ja", "Niet bekend", "Soms", "Meestal"].includes(i.answer)) ||
    (!i.choice && i.value.trim() !== "" && noteworthy.test(i.value))
  )).map(([number, answers]) => ({ number, question: answers[0].question, answers: answers.filter(i => i.value !== "") }));
  return { objectcode, systemid: fields._systemid, version: fields.versienummer || "", sellerUpdatedAt: fields.changedbycustomer || fields.vllastupd || "", fields, items, highlights, labelsComplete: items.every(i => i.labelKnown) };
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]!));
export function renderQuestionsBriefing(list: QuestionList | null, newPage = true): string {
  if (!list) return '<p>Vragenlijst: nog niet ontvangen.</p>';
  return `<section style="break-before:${newPage ? "page" : "auto"};font-family:Arial,sans-serif;font-size:12px"><h2>Aandachtspunten uit de vragenlijst</h2><p>Bron: Realworks vragenlijst ${esc(list.systemid)} (versie ${esc(list.version)}), object ${esc(list.objectcode)}. Dit zijn verklaringen en toelichtingen van de verkoper, geen vastgestelde technische conclusies.</p>${!list.labelsComplete ? '<p>Niet alle vraagteksten zijn gekoppeld. Controleer de oorspronkelijke vragenlijst.</p>' : ''}${list.highlights.map(g => `<div style="break-inside:avoid;margin:10px 0"><strong>${esc(g.number)} ${esc(g.question)}</strong><ul style="margin-top:6px;margin-bottom:6px">${g.answers.map(i => `<li>${i.label !== i.question ? esc(i.label) + ' ' : ''}${esc(i.answer)}</li>`).join('')}</ul></div>`).join('') || '<p>Geen aandachtspunten geselecteerd. Dit is geen verklaring dat de woning vrij is van gebreken.</p>'}</section>`;
}
