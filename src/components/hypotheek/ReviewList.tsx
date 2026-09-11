"use client";
import { useEffect, useState } from "react";
import ReferralForm, { Contact } from "./ReferralForm";
type Event = {
    id: string;
    onderwerp: string;
    passage: string;
    reden: string;
    datum: string | null;
    adviseurId: string | null;
    contactVoorstel: Contact[] | null;
};
export default function ReviewList() {
    const [events, setEvents] = useState<Event[]>([]), [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0), [version, setVersion] = useState(0), [selected, setSelected] = useState<Event | null>(null), [error, setError] = useState("");
    const [auto, setAuto] = useState(false), [busy, setBusy] = useState(false);
    useEffect(() => { fetch("/api/hypotheek-doorverwijzingen/instellingen").then(r => r.json()).then(d => setAuto(d.automatisch)).catch(() => setError("Instelling kon niet worden geladen.")); }, []);
    useEffect(() => { fetch(`/api/hypotheek-doorverwijzingen/mail-events?page=${page}`).then(async (r) => { if (!r.ok)
        throw Error(); return r.json(); }).then(d => { setEvents(d.events); setPages(d.pagination.pages); setTotal(d.pagination.total); }).catch(() => setError("Controlelijst kon niet worden geladen.")); }, [page, version]);
    async function toggle() { setBusy(true); try {
        const r = await fetch("/api/hypotheek-doorverwijzingen/instellingen", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ automatisch: !auto }) });
        if (!r.ok)
            throw Error();
        setAuto((await r.json()).automatisch);
    }
    catch {
        setError("Instelling kon niet worden opgeslagen.");
    }
    finally {
        setBusy(false);
    } }
    async function ignore(id: string) { try {
        const r = await fetch(`/api/hypotheek-doorverwijzingen/mail-events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ignore" }) });
        if (!r.ok)
            throw Error();
        setVersion(v => v + 1);
    }
    catch {
        setError("Afhandelen is niet gelukt.");
    } }
    return <section className="mb-6 rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Te controleren ({total})</h2><button disabled={busy} onClick={toggle} className="rounded border px-3 py-2 text-sm">Automatisch koppelen: {auto ? "aan" : "uit"}</button></div><p className="mt-2 text-sm text-gray-500">Eenduidige nieuwe doorverwijsmails worden {auto ? "automatisch geregistreerd" : "hier klaargezet"}. Twijfelgevallen controleer je hieronder.</p>{error && <p role="alert" className="text-red-700">{error}</p>}{events.map(e => <div className="mt-3 rounded bg-gray-50 p-3 text-sm" key={e.id}><strong>{e.onderwerp}</strong><p>{e.datum?.slice(0, 10) || "Datum onbekend"} · {e.reden}</p><p className="my-2 whitespace-pre-wrap">{e.passage}</p><div className="flex gap-4"><button className="text-blue-700" onClick={() => setSelected(e)}>Controleren en registreren</button><button onClick={() => ignore(e.id)}>Geen doorverwijzing</button></div></div>)}{pages > 1 && <div className="mt-3 flex gap-3"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Vorige</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Volgende</button></div>}{selected && <ReferralForm mailEventId={selected.id} adviseurId={selected.adviseurId || undefined} datum={selected.datum} contact={selected.contactVoorstel?.length === 1 ? selected.contactVoorstel[0] : undefined} onClose={() => setSelected(null)} onSaved={() => setVersion(v => v + 1)}/>}</section>;
}
