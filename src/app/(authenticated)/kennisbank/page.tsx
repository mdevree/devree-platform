"use client";

import { useEffect, useState } from "react";
import { BookOpenIcon, MagnifyingGlassIcon, SparklesIcon } from "@heroicons/react/24/outline";

type Source = { sourceId: string; title: string; sourceType: string; section?: string; excerpt: string; distanceKm?: number | null; authorityRank: number };
type Stats = { sources: number; chunks: number; embedded: number };

export default function KennisbankPage() {
  const [query, setQuery] = useState(""); const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]); const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  useEffect(() => { fetch("/api/kennis/sources").then((r) => r.json()).then((data) => setStats(data.stats)).catch(() => null); }, []);

  async function ask(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setAnswer(""); setSources([]);
    try {
      const response = await fetch("/api/kennis/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Vraag mislukt");
      setAnswer(data.answer); setSources(data.sources || []);
    } catch (err) { setError(err instanceof Error ? err.message : "Vraag mislukt"); } finally { setLoading(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold text-gray-900">Kennisbank</h1><p className="mt-1 text-sm text-gray-600">Zoek in NWWI-instructies, validatie-updates, interne richtlijnen en eigen gevalideerde taxaties.</p></div><BookOpenIcon className="h-9 w-9 text-primary" /></div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[['Bronnen', stats?.sources], ['Tekstfragmenten', stats?.chunks], ['Semantisch geïndexeerd', stats?.embedded]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-gray-200 bg-white p-4"><div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div><div className="mt-1 text-2xl font-semibold text-gray-900">{value ?? '—'}</div></div>)}
    </div>
    <form onSubmit={ask} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <label htmlFor="knowledge-query" className="mb-2 block text-sm font-medium text-gray-800">Wat wil je weten of schrijven?</label>
      <textarea id="knowledge-query" value={query} onChange={(e) => setQuery(e.target.value)} rows={4} maxLength={3000} placeholder="Bijvoorbeeld: Welke eerdere formuleringen en actuele instructies zijn relevant voor de omgevingsbeschrijving van Kikkerveen?" className="w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      <div className="mt-3 flex items-center justify-between"><span className="text-xs text-gray-500">Rapporten dienen als praktijkvoorbeeld; officiële instructies blijven leidend.</span><button disabled={loading || query.trim().length < 2} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><SparklesIcon className="h-4 w-4" />{loading ? 'Bezig…' : 'Vraag kennisbank'}</button></div>
    </form>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {answer && <section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900"><MagnifyingGlassIcon className="h-5 w-5" />Antwoord</h2><div className="whitespace-pre-wrap text-sm leading-7 text-gray-800">{answer}</div></section>}
    {sources.length > 0 && <section><h2 className="mb-3 font-semibold text-gray-900">Gebruikte bronnen</h2><div className="grid gap-3 md:grid-cols-2">{sources.map((source, index) => <article key={`${source.sourceId}-${index}`} className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-gray-900">[{index + 1}] {source.title}</h3><span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600">{source.sourceType.replaceAll('_', ' ')}</span></div><p className="mt-1 text-xs text-gray-500">{source.section}{source.distanceKm != null ? ` · ${Math.round(source.distanceKm * 1000)} meter` : ''}</p><p className="mt-2 line-clamp-4 text-xs leading-5 text-gray-600">{source.excerpt}</p></article>)}</div></section>}
  </div>;
}
