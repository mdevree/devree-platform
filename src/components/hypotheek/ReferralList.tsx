"use client";
import { useEffect, useState } from "react";
import ReferralForm, { Referral, ReferralButton } from "./ReferralForm";
export default function ReferralList({ adviseurId, onSaved, periode, onPeriodeChange }: {
    adviseurId: string;
    periode: string;
    onPeriodeChange: (value:string)=>void;
    onSaved: () => void;
}) {
    const [search, setSearch] = useState(""), [page, setPage] = useState(1), [version, setVersion] = useState(0);
    const [rows, setRows] = useState<Referral[]>([]), [total, setTotal] = useState(0), [pages, setPages] = useState(0), [error, setError] = useState("");
    const [edit, setEdit] = useState<Referral | null>(null);
    useEffect(() => { let active = true; fetch(`/api/hypotheekadviseurs/${adviseurId}/doorverwijzingen?periode=${periode}&search=${encodeURIComponent(search)}&page=${page}`).then(async (r) => { if (!r.ok)
        throw Error(); return r.json(); }).then(d => { if (active) {
        setRows(d.doorverwijzingen);
        setTotal(d.pagination.total);
        setPages(d.pagination.pages);
        setError("");
    } }).catch(() => { if (active)
        setError("Doorverwijzingen konden niet worden geladen."); }); return () => { active = false; }; }, [adviseurId, periode, search, page, version]);
    function saved() { setVersion(v => v + 1); onSaved(); }
    return <div className="space-y-3"><ReferralButton adviseurId={adviseurId} onSaved={saved}/><div className="flex gap-2"><input aria-label="Zoek doorverwijzingen" className="min-w-0 flex-1 rounded border p-2 text-sm" placeholder="Naam, e-mail of telefoon" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/><select aria-label="Periode doorverwijzingen" value={periode} onChange={e => { onPeriodeChange(e.target.value); setPage(1); }} className="rounded border text-sm">{[['alles', 'Alles'], ['maand', 'Deze maand'], ['kwartaal', 'Dit kwartaal'], ['jaar', 'Dit jaar']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div><h3 className="font-semibold">Doorverwijzingen ({total})</h3>{error && <p role="alert">{error}</p>}{!rows.length && !error && <p className="text-sm text-gray-500">Geen doorverwijzingen in deze selectie.</p>}{rows.map(r => <button key={r.id} onClick={() => setEdit(r)} className="block w-full rounded border p-3 text-left text-sm hover:bg-gray-50"><strong>{r.deelnemers.map(d => d.lead.naam).join(" & ")}</strong><p>{r.datum ? new Date(r.datum).toLocaleDateString("nl-NL", { timeZone: "UTC" }) : "Datum onbekend"}</p><p className="text-gray-500">{r.herkomst === "email" ? "Automatisch uit e-mail" : r.herkomst === "email_review" ? "Uit e-mail, gecontroleerd" : r.herkomst === "migratie" ? "Bestaande doorverwijzing" : "Handmatig geregistreerd"}{r.hypotheekAfgesloten ? " · Hypotheek afgesloten" : ""}</p></button>)}<div className="flex justify-between text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Vorige</button><span>Pagina {page} van {Math.max(1, pages)}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Volgende</button></div>{edit && <ReferralForm edit={edit} onClose={() => setEdit(null)} onSaved={saved}/>}</div>;
}
