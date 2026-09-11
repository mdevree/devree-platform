export function phone(value: string | null | undefined) {
    let n = (value || "").replace(/\D/g, "");
    if (n.startsWith("00"))
        n = n.slice(2);
    else if (n.startsWith("0"))
        n = `31${n.slice(1)}`;
    return n.length >= 9 && n.length <= 15 ? n : "";
}
export function email(value: string | null | undefined) { return (value || "").trim().toLowerCase(); }
export function day(value: unknown): Date | null {
    if (value === null || value === "")
        return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Error("Gebruik een geldige datum (jjjj-mm-dd).");
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        throw new Error("Ongeldige datum.");
    return date;
}
export function dutchDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}
export function periodFilter(periode: string | null, now = new Date()) {
    const today = dutchDay(now), year = today.slice(0, 4), month = Number(today.slice(5, 7));
    const first = periode === "maand" ? `${year}-${String(month).padStart(2, "0")}-01` : periode === "kwartaal" ? `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01` : periode === "jaar" ? `${year}-01-01` : null;
    return first ? { gte: day(first)!, lte: day(today)! } : undefined;
}
export function addresses(value: unknown): string[] {
    const text = typeof value === "string" ? value : JSON.stringify(value || "");
    return [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(email))];
}
export function newText(value: string) {
    return value.replace(/<blockquote\b[^>]*>[\s\S]*$/i, "").replace(/<(br|\/p|\/div)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/^.*(?:0181.{0,4}611919).*info@devreemakelaardij\.nl.*$/gim, "")
        .split(/\n\s*(?:Van:|From:|Op .+schreef|On .+wrote|[-_]{3,}\s*(?:Original|Oorspronkelijk)|>)/i)[0]
        .split(/(?:Met vriendelijke groet|Vriendelijke groet|Kind regards|Best regards)/i)[0].trim();
}
export function classify(body: string, subject: string) {
    const text = newText(body);
    const excluded = /\b(?:factuur|taxatie|taxatienota|taxatierapport|schademelding|schadenummer|verzekeringsschade|taxatieaanvraag|taxatie nwwi)\b/i.test(subject + " " + text);
    const explicit = /(?:afspraak|gesprek)\s+(?:te\s+)?(?:in\s*plannen|maken|plannen)|(?:in\s*plannen|maak|maken|plan)\b[^.!?\n]{0,70}\b(?:afspraak|gesprek)|doorverwij[sz]|(?:gegevens|informatie)\s+voor\s+(?:je|jouw|uw)\s+afspraak/i.test(text);
    return { text, referral: !excluded && explicit, household: /\b(familie|gezin|partners|beiden|echtpaar)\b/i.test(text), emails: addresses(text), phones: [...new Set((text.match(/(?:\+31|0031|0)[\d ()-]{8,18}\d/g) || []).map(phone).filter(Boolean))] };
}
