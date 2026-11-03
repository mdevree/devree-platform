import labels2023 from "@/lib/realworks/vragenlijst-woonhuis-2023.json";
export type QuestionItem = { field: string; number: string; section: string; question: string; label: string; answer: string; value: string; choice: boolean; labelKnown: boolean };
export type QuestionList = { objectcode: string; systemid: string; version: string; sellerUpdatedAt: string; items: QuestionItem[]; fields: Record<string, string>; highlights: { number: string; question: string; title: string; details: string[]; answers: QuestionItem[] }[]; labelsComplete: boolean };
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
  const risk = /gebrek|lekk|vocht|schimmel|asbest|verontreinig|\bgeschil(?:len)?\b|scheur|overlast|verzak|huur|lease|erfdienst|aanschrijving|illegaal|beschadig|beslag|beperking|recht van|vergunning/i;
  const noteworthy = /vocht|schimmel|schade|geen ventilatiebox|nooit|vervangen|tuinhuis|overkapping/i;
  const improvement = /geschilderd|vernieuwd|verbouwing|bijbouwing/i;
  const positive = (i: QuestionItem) => i.choice && ["Ja", "Soms", "Meestal"].includes(i.answer);
  const useful = (i: QuestionItem) => i.value.trim() !== "" && !/^(?:nee|neen|niet bekend|onbekend|geen idee|weet (?:ik )?niet|niet van toepassing|n\.?v\.?t\.?|niet beantwoord|niet ingevuld|geen|niet het geval)[.!\s]*$/i.test(i.answer.trim()) && !i.answer.startsWith("Onbekende keuze");
  const titles: Record<string, string> = { "4B.": "Schilderwerk", "4E.": "Beglazing", "5A.": "Vocht", "5B.": "Schimmel", "6A.": "Fundering", "7H.": "Zonnepanelen", "7K.": "Elektrische installatie", "7M.": "Ventilatie", "8A.": "Sanitair", "8B.": "Badkamer", "9B.": "Asbest", "9F.": "Asbest in de tuin", "9H.": "Bodem", "9M.": "Verbouwingen en bijgebouwen" };
  const highlights = [...groups.entries()].flatMap(([number, group]) => {
    const answers = group.filter(useful);
    const relevant = answers.some(i => (positive(i) && risk.test(i.label)) || (!i.choice && (noteworthy.test(i.value) || improvement.test(i.question))));
    if (!relevant) return [];
    const free = answers.filter(i => !i.choice);
    const details = free.map(i => {
      const label = i.label === i.question || /^Zo (?:ja|nee)[, :]/i.test(i.label) ? "" : i.label + " ";
      return label + i.answer;
    });
    // A concrete explanation replaces a redundant yes, but never another confirmed issue.
    for (const i of answers.filter(i => positive(i) && risk.test(i.label))) {
      if (i.label === i.question && free.length) continue;
      details.push(`${i.label} ${i.answer}`);
    }
    if (number === "7H.") {
      // Ownership and lease can both be ticked: preserve this actionable contradiction.
      const owned = answers.some(i => i.field === "answer_730" && positive(i));
      const leased = answers.some(i => i.field === "answer_732" && positive(i));
      if (leased) {
        details.splice(0, details.length, owned ? "Eigendom én huur/lease aangekruist; controleer het contract." : "Huur/lease aangekruist.");
        if (answers.some(i => i.field === "answer_733" && positive(i))) details.push("Huur-/leasecontract kan volgens verkoper worden overgenomen.");
        const installer = free.find(i => i.field === "answer_735");
        if (installer) details.push(`Installateur: ${installer.answer}`);
      }
    }
    return [{ number, question: group[0].question, title: titles[number] || group[0].question.replace(/\s*\([^)]*\)/g, ""), details, answers }];
  });
  return { objectcode, systemid: fields._systemid, version: fields.versienummer || "", sellerUpdatedAt: fields.changedbycustomer || fields.vllastupd || "", fields, items, highlights, labelsComplete: items.every(i => i.labelKnown) };
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]!));
export function renderQuestionsBriefing(list: QuestionList | null, newPage = true): string {
  if (!list) return '<p>Vragenlijst: nog niet ontvangen.</p>';
  return `<section style="break-before:${newPage ? "page" : "auto"};font-family:Arial,sans-serif;font-size:12px"><h2>Aandachtspunten uit de vragenlijst</h2><p>Bron: Realworks vragenlijst ${esc(list.systemid)} (versie ${esc(list.version)}), object ${esc(list.objectcode)}. Dit zijn verklaringen en toelichtingen van de verkoper, geen vastgestelde technische conclusies.</p>${!list.labelsComplete ? '<p>Niet alle vraagteksten zijn gekoppeld. Controleer de oorspronkelijke vragenlijst.</p>' : ''}${list.highlights.map(g => `<div style="break-inside:avoid;margin:9px 0;display:flex;gap:12px"><strong style="width:145px;flex-shrink:0">${esc(g.title)} <span style="font-weight:normal;color:#64748b">(${esc(g.number)})</span></strong><div>${g.details.map(d => `<div style="margin-bottom:3px">${esc(d)}</div>`).join('')}</div></div>`).join('') || '<p>Geen aandachtspunten geselecteerd. Dit is geen verklaring dat de woning vrij is van gebreken.</p>'}</section>`;
}
