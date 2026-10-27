"use client";

import { useEffect, useState } from 'react';
import type { MarketingCard, MarketingOverview as Overview } from '@/lib/marketing/overview';

const number = (value: number) => new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(value);
const day = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
const time = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(value));

function Sparkline({ card }: { card: MarketingCard }) {
  const points = card.points;
  if (points.length < 2 || points.some(p => p.total === null)) return null;
  const values = points.map(p => p.total!);
  const max = Math.max(...values,1);
  const line = values.map((v,i) => `${2 + i / (values.length - 1) * 116},${30 - v / max * 26}`).join(' ');
  return <svg viewBox="0 0 120 34" className="h-9 w-28 shrink-0 text-primary" role="img" aria-label={`Dagverloop ${card.name}: ${points.map(p => `${day(p.date)}: ${number(p.total!)}`).join(', ')}`}>
    <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}

function Card({ card, days }: { card: MarketingCard; days: number }) {
  const change = card.delta === null ? null : card.delta > 0 ? '↑' : card.delta < 0 ? '↓' : '→';
  const color = card.stale ? 'text-amber-700' : card.delta === null || card.delta === 0 ? 'text-gray-500' : card.delta > 0 ? 'text-emerald-700' : 'text-red-700';
  return <article className="min-w-0 border border-gray-200 bg-white p-4">
    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-gray-900">{card.name}</h3>{card.stale && <span className="text-xs text-amber-700">Oudere meting</span>}</div>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-2"><div><p className="text-2xl font-semibold tabular-nums text-gray-950">{card.value === null ? '—' : number(card.value)}</p><p className="text-xs text-gray-500">{card.unit}</p></div><Sparkline card={card} /></div>
    <div className={`mt-3 min-h-5 text-sm font-medium tabular-nums ${color}`}>
      {change ? <span>{change} {card.percent === null ? `+${number(card.delta!)} vanaf 0` : `${card.percent > 0 ? '+' : ''}${number(card.percent)}% (${card.delta! > 0 ? '+' : ''}${number(card.delta!)})`}</span> : <span className="text-xs">{card.reason}</span>}
    </div>
    <p className="mt-1 text-xs text-gray-500">{card.mode === 'stock' ? `Stand · verschil over ${days} dagen` : card.mode === 'window' ? `Laatste ${days} dagen volgens Postiz` : card.start && card.end ? `${day(card.start)} – ${day(card.end)}` : `${days} volledige brondagen`}</p>
    <details className="mt-2 text-xs text-gray-500">
      <summary className="cursor-pointer hover:text-primary">Meetgegevens</summary>
      <div className="mt-2 space-y-1.5 leading-relaxed">
        <p>{card.note}</p>
        {card.previous !== null && <p>Vorige {card.mode === 'stock' ? 'stand' : 'periode'}: {number(card.previous)} {card.unit}{card.previousStart && card.previousEnd ? ` (${day(card.previousStart)}${card.previousStart !== card.previousEnd ? ` – ${day(card.previousEnd)}` : ''})` : ''}.</p>}
        {card.capturedAt && <p>Opgehaald: {time(card.capturedAt)}.</p>}
        {card.status !== 'ok' && <p className="text-amber-700">{card.status === 'disabled' ? 'Kanaal uitgeschakeld in Postiz.' : 'Geen actuele, volledige gegevens ontvangen. Controleer de koppeling in Postiz.'}</p>}
        {card.mode !== 'daily' && card.previous === null && card.value !== null && <p>Vergelijking verschijnt zodra een meting van {days} dagen eerder beschikbaar is.</p>}
      </div>
    </details>
  </article>;
}

export default function MarketingOverview() {
  const [days,setDays] = useState<7 | 30>(7);
  const [data,setData] = useState<Overview | null>(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/marketing/overview?days=${days}`, { signal: abort.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error('Marketinggegevens tijdelijk niet beschikbaar.'); return r.json() as Promise<Overview>; })
      .then(value => { setData(value); setError(''); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message || 'Laden mislukt.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  },[days]);
  const primary = data?.cards.filter(c => ['facebook','instagram','gmb'].includes(c.provider)) || [];
  const other = data?.cards.filter(c => !['facebook','instagram','gmb'].includes(c.provider)) || [];
  const selectDays = (value: 7 | 30) => { if (value !== days) { setLoading(true); setError(''); setData(null); setDays(value); } };
  return <section className="border border-gray-200 bg-white" aria-label="Online zichtbaarheid">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
      <div><h2 className="text-lg font-semibold text-gray-900">Online zichtbaarheid</h2><p className="mt-1 text-xs text-gray-500">Groei of daling tegenover de vorige periode · Postiz</p></div>
      <div className="flex flex-wrap items-center gap-3"><div className="inline-flex border border-gray-200" aria-label="Meetperiode">{([7,30] as const).map(d => <button key={d} type="button" onClick={() => selectDays(d)} aria-pressed={d === days} className={`min-h-9 px-3 text-sm ${d === days ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{d} dagen</button>)}</div><a href="https://postiz.devreemakelaardij.nl/analytics" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline">Postiz ↗</a></div>
    </div>
    <div className="p-4" aria-live="polite" aria-busy={loading}>
      {loading ? <p className="py-3 text-sm text-gray-500">Marketinggegevens laden…</p> : error ? <p role="alert" className="text-sm text-amber-700">{error}</p> : !data?.cards.length ? <p className="py-3 text-sm text-gray-500">De eerste marketingmetingen worden opgehaald.</p> : <>
        <div className="grid gap-3 md:grid-cols-3">{primary.map(card => <Card key={card.id} card={card} days={days} />)}</div>
        {!!other.length && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">Andere kanalen ({other.length})</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{other.map(card => <Card key={card.id} card={card} days={days} />)}</div></details>}
        <p className="mt-3 text-xs text-gray-400">{data.lastAttemptAt ? `Laatste controle: ${time(data.lastAttemptAt)}. ` : ''}De einddatum kan per bron verschillen. Ontbrekende waarden worden niet als nul getoond.</p>
      </>}
    </div>
  </section>;
}
