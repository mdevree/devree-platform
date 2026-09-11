"use client";
import { useEffect, useRef, useState } from "react";
import { dutchDay } from "@/lib/hypotheek/rules";
export type Contact = {
    leadId?: string;
    mauticContactId?: string;
    naam?: string;
    email?: string | null;
    telefoon?: string | null;
    bron?: string;
    koppelingen?: {
        adviseurId: string;
        doorverwijzingId: string;
    }[];
};
export type Referral = {
    id: string;
    adviseurId: string;
    datum: string | null;
    notities: string | null;
    herkomst: string;
    hypotheekAfgesloten: boolean;
    adviseur: {
        naam: string;
        bedrijf: string | null;
    };
    deelnemers: {
        leadId: string;
        hoofdcontact: boolean;
        lead: {
            id: string;
            naam: string;
            email: string | null;
            telefoon: string | null;
        };
    }[];
};
type Props = {
    adviseurId?: string;
    contact?: Contact;
    edit?: Referral;
    mailEventId?: string;
    datum?: string | null;
    onClose: () => void;
    onSaved: () => void;
};
export default function ReferralForm(p: Props) {
    const [adviseurs, setAdviseurs] = useState<{
        id: string;
        naam: string;
        bedrijf: string | null;
        actief: boolean;
    }[]>([]);
    const [adviseurId, setAdviseurId] = useState(p.edit?.adviseurId || p.adviseurId || "");
    const [contacten, setContacten] = useState<Contact[]>(p.edit ? p.edit.deelnemers.map(d => ({ leadId: d.leadId, naam: d.lead.naam, email: d.lead.email, telefoon: d.lead.telefoon })) : p.contact ? [p.contact] : []);
    const [datum, setDatum] = useState(p.edit ? p.edit.datum?.slice(0, 10) || "" : p.datum === null ? "" : p.datum?.slice(0, 10) || dutchDay());
    const [notities, setNotities] = useState(p.edit?.notities || "");
    const [afgesloten, setAfgesloten] = useState(p.edit?.hypotheekAfgesloten || false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Contact[]>([]);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [existingId, setExistingId] = useState("");
    const [fresh, setFresh] = useState<Contact | null>(null);
    const [loaded, setLoaded] = useState<Referral | null>(null);
    const dialog = useRef<HTMLDivElement>(null);
    useEffect(() => { fetch("/api/hypotheekadviseurs").then(r => r.json()).then(d => setAdviseurs(d.adviseurs || [])).catch(() => setError("Adviseurs konden niet worden geladen.")); dialog.current?.focus(); }, []);
    useEffect(() => { if (query.trim().length < 2)
        return; const ctrl = new AbortController(); const t = setTimeout(() => { fetch(`/api/hypotheek-doorverwijzingen/contacten?search=${encodeURIComponent(query)}`, { signal: ctrl.signal }).then(r => r.json()).then(d => { setResults(d.contacten || []); if (d.warning)
        setError(d.warning); }).catch(e => { if (e.name !== "AbortError")
        setError("Zoeken is niet gelukt."); }); }, 300); return () => { clearTimeout(t); ctrl.abort(); }; }, [query]);
    function add(c: Contact) { if (!contacten.some(x => (c.leadId && x.leadId === c.leadId) || (c.mauticContactId && x.mauticContactId === c.mauticContactId)))
        setContacten([...contacten, c]); setQuery(""); setResults([]); setFresh(null); }
    async function openExisting(id: string) { const r = await fetch(`/api/hypotheek-doorverwijzingen/${id}`); if (!r.ok) {
        setError("Doorverwijzing kon niet worden geopend.");
        return;
    } setLoaded((await r.json()).doorverwijzing); }
    async function save() { setSaving(true); setError(""); try {
        const url = p.edit ? `/api/hypotheek-doorverwijzingen/${p.edit.id}` : p.mailEventId ? `/api/hypotheek-doorverwijzingen/mail-events/${p.mailEventId}` : "/api/hypotheek-doorverwijzingen";
        const r = await fetch(url, { method: p.edit || p.mailEventId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adviseurId, contacten, datum: datum || null, notities, hypotheekAfgesloten: afgesloten, action: "register" }) });
        const d = await r.json();
        if (!r.ok) {
            setError(d.error || "Opslaan mislukt.");
            setExistingId(d.existingId || "");
            return;
        }
        if (d.existing) {
            setError("Al gekoppeld. Open de bestaande doorverwijzing om deze te bekijken of te wijzigen.");
            setExistingId(d.doorverwijzing.id);
            return;
        }
        p.onSaved();
        p.onClose();
    }
    catch {
        setError("Verbinding verbroken. Probeer opnieuw; dubbele registratie wordt voorkomen.");
    }
    finally {
        setSaving(false);
    } }
    if (loaded)
        return <ReferralForm edit={loaded} onClose={p.onClose} onSaved={p.onSaved}/>;
    const input = "w-full rounded border border-gray-300 p-2 text-sm";
    return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onKeyDown={e => { if (e.key === "Tab") {
        const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []);
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    if (e.key === "Escape" && !saving)
        p.onClose(); }}><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Doorverwijzing" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-6 shadow-xl">
 <div className="mb-4 flex justify-between"><h2 className="text-lg font-semibold">{p.edit ? "Doorverwijzing wijzigen" : "Doorverwijzing toevoegen"}</h2><button aria-label="Sluiten" disabled={saving} onClick={p.onClose}>✕</button></div>
 <label className="block mb-3 text-sm">Hypotheekadviseur<select className={input} value={adviseurId} onChange={e => setAdviseurId(e.target.value)}><option value="">Kies een adviseur</option>{adviseurs.filter(a => a.actief || a.id === adviseurId).map(a => <option key={a.id} value={a.id}>{a.bedrijf || a.naam} — {a.naam}</option>)}</select></label>
 <p className="text-sm font-medium">Betrokkenen — samen één doorverwijzing</p>
 {contacten.map((c, i) => <div key={i} className="my-2 rounded bg-gray-50 p-2 text-sm"><div className="flex justify-between"><strong>{c.naam}</strong><button onClick={() => setContacten(contacten.filter((_, n) => i !== n))}>Verwijderen</button></div><div>{c.email} {c.telefoon}</div><div className="text-gray-500">{i === 0 ? "Hoofdcontact" : <button onClick={() => setContacten([c, ...contacten.filter((_, n) => i !== n)])}>Als hoofdcontact gebruiken</button>}</div>{c.koppelingen?.filter(k => k.adviseurId === adviseurId).map(k => <button className="text-blue-700" key={k.doorverwijzingId} onClick={() => openExisting(k.doorverwijzingId)}>Al gekoppeld — openen</button>)}</div>)}
 <label className="block my-3 text-sm">{contacten.length ? "Medebetrokkene toevoegen" : "Contact zoeken"}<input className={input} placeholder="Naam, e-mail of telefoon" value={query} onChange={e => { setQuery(e.target.value); setResults([]); }}/></label>
 {results.map((c, i) => <button key={i} className="block w-full border-b p-2 text-left text-sm hover:bg-gray-50" onClick={() => add(c)}><strong>{c.naam}</strong> · {c.bron}<div>{c.email} {c.telefoon}</div></button>)}
 <button className="my-2 text-sm text-blue-700" onClick={() => setFresh({ naam: query, email: "", telefoon: "" })}>+ Nieuw contact</button>
 {fresh && <div className="space-y-2 rounded border p-3">{([['naam', 'Naam'], ['email', 'E-mail'], ['telefoon', 'Telefoon']] as const).map(([k, label]) => <label className="block text-sm" key={k}>{label}<input className={input} value={fresh[k] || ""} onChange={e => setFresh({ ...fresh, [k]: e.target.value })}/></label>)}<button disabled={!fresh.naam?.trim()} onClick={() => add(fresh)} className="text-blue-700">Contact gebruiken</button></div>}
 <label className="block my-3 text-sm">Doorverwijsdatum<input className={input} type="date" value={datum} onChange={e => setDatum(e.target.value)}/></label><label className="text-sm"><input type="checkbox" checked={!datum} onChange={e => setDatum(e.target.checked ? "" : dutchDay())}/> Datum onbekend</label>
 <label className="block my-3 text-sm">Notitie<textarea className={input} rows={3} value={notities} onChange={e => setNotities(e.target.value)}/></label>
 {p.edit && <label className="block text-sm"><input type="checkbox" checked={afgesloten} onChange={e => setAfgesloten(e.target.checked)}/> Hypotheek afgesloten</label>}
 {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}{existingId && <button className="text-blue-700" onClick={() => openExisting(existingId)}>Bestaande doorverwijzing openen</button>}
 <div className="mt-4 flex justify-end gap-3"><button disabled={saving} onClick={p.onClose}>Annuleren</button><button className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50" disabled={saving || !adviseurId || !contacten.length} onClick={save}>{saving ? "Opslaan…" : p.edit ? "Opslaan" : "Registreren"}</button></div>
 </div></div>;
}
export function ReferralButton({ contact, adviseurId, onSaved }: {
    contact?: Contact;
    adviseurId?: string;
    onSaved?: () => void;
}) { const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); return <><button type="button" className="rounded-lg border border-primary px-3 py-2 text-sm text-primary" onClick={() => setOpen(true)}>Doorverwijzing toevoegen</button>{message && <span role="status" className="ml-2 text-sm text-green-700">{message}</span>}{open && <ReferralForm contact={contact} adviseurId={adviseurId} onClose={() => setOpen(false)} onSaved={() => { setMessage("Doorverwijzing geregistreerd"); onSaved?.(); }}/>}</>; }
