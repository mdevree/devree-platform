"use client";
import { useEffect, useState } from "react";
import { appointmentEventLabels, type HistoryItem } from "@/lib/contactHistory";

type Card = { id: string; address: string; start: string | null; phase: string; status: string; publicUrl: string | null; previewUrl: string; measurementAvailable: boolean; counts: Record<string, Record<string, number>> };
type Result = { appointments: Card[]; items: HistoryItem[]; nextCursor: string | null };
const periods = { before: "Vóór", during: "Tijdens", after: "Na", unknown: "Tijdstip onbekend" };
function date(value: string) { return new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
export default function ContactHistory({ contactId }: { contactId: number }) {
  const [data, setData] = useState<Result | null>(null);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/mautic/contact/${contactId}/history?category=${category}`, { signal: controller.signal }).then(async r => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Historie laden mislukt");
      if (!controller.signal.aborted) { setData(body); setError(""); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [contactId, category, retry]);
  async function more() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await fetch(`/api/mautic/contact/${contactId}/history?category=${category}&cursor=${encodeURIComponent(data.nextCursor)}`);
      const next: Result & { error?: string } = await r.json();
      if (!r.ok) throw new Error(next.error || "Historie laden mislukt");
      setData(current => current ? { ...next, items: [...current.items, ...next.items] } : next);
    } catch(e) { setError(e instanceof Error ? e.message : "Laden mislukt"); }
    finally { setLoadingMore(false); }
  }
  return <section className="space-y-4 border-t border-gray-200 pt-5">
    <h3 className="text-lg font-semibold">Afspraken & activiteit</h3>
    {error && <div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Opnieuw proberen</button></div>}
    {!data && !error && <p className="text-sm text-gray-500">Historie laden…</p>}
    {data?.appointments.map(a => <article key={a.id} className="space-y-3 rounded-lg border border-gray-200 p-3">
      <div><h4 className="font-semibold">{a.address}</h4><p className="text-sm text-gray-600">{a.start ? date(a.start) : "Datum onbekend"} · {a.phase === "after" ? "Afgelopen" : a.phase === "cancelled" ? "Geannuleerd" : "Vooraf"} · {a.status}</p></div>
      <div className="flex flex-wrap gap-3 text-sm"><a href={a.previewUrl} target="_blank" rel="noreferrer" className="text-primary underline">Preview zonder tracking</a>{a.publicUrl && <button className="text-primary underline" onClick={() => navigator.clipboard.writeText(a.publicUrl!).catch(() => setError("Kopiëren mislukt. Selecteer de link hieronder."))}>Link kopiëren</button>}</div>
      {a.publicUrl && <details className="text-xs text-gray-500"><summary>Persoonlijke link</summary><p className="break-all select-all">{a.publicUrl}</p></details>}
      {!a.measurementAvailable ? <p className="text-sm text-gray-500">Geen meetgegevens beschikbaar vanaf verzending.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Gebeurtenis</th>{Object.values(periods).map(p => <th key={p} className="px-1">{p}</th>)}</tr></thead><tbody>{Object.entries(appointmentEventLabels).map(([key,label]) => <tr key={key} className="border-t border-gray-100"><td className="py-1.5">{label}</td>{Object.keys(periods).map(p => <td key={p} className="px-1">{a.counts[p]?.[key] || 0}</td>)}</tr>)}</tbody></table></div>}
    </article>)}
    <p className="text-xs text-gray-500">Dit zijn geregistreerde gebeurtenissen, geen unieke personen. Een klik bewijst geen verzonden WhatsApp of geplaatste review.</p>
    <label className="block text-sm">Toon <select value={category} disabled={loadingMore} onChange={e => { setCategory(e.target.value); setData(null); setError(""); }} className="ml-2 rounded border border-gray-300 p-1"><option value="">Alles</option><option value="appointments">Afspraken</option><option value="whatsapp">WhatsApp</option><option value="calls">Telefonie</option><option value="activity">Links, video & Mautic</option></select></label>
    {data?.items.length === 0 && <p className="text-sm text-gray-500">Geen gekoppelde activiteit gevonden.</p>}
    <ol className="divide-y divide-gray-100">{data?.items.map(item => <li key={item.id} className="py-3"><p className="text-xs text-gray-500">{date(item.at)} · {item.source}</p><p className="text-sm font-medium">{item.title}</p>{item.detail && <details className="mt-1 text-sm text-gray-600"><summary className="cursor-pointer">Inhoud / notities</summary><p className="mt-2 whitespace-pre-wrap break-words">{item.detail}</p></details>}</li>)}</ol>
    {data?.nextCursor && <button disabled={loadingMore} onClick={more} className="rounded border border-gray-300 px-3 py-2 text-sm">{loadingMore ? "Laden…" : "Meer historie"}</button>}
  </section>;
}
