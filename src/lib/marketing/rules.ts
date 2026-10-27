export type Metric = { label: string; data: { date: string; total: number }[] };
export type Channel = { id: string; name: string; provider: string; status: 'ok' | 'empty' | 'error' | 'disabled' | 'unsupported' };
export type Snapshot = { channelId: string; provider: string; windowDays: number; capturedAt: Date; metrics: unknown };
export type MetricSpec = { name: string; label: string; unit: string; mode: 'daily' | 'window' | 'stock'; offset: number; lag: number; note: string };
export const SPECS: Record<string, MetricSpec> = {
  facebook: { name: 'Facebook', label: 'Media views', unit: 'mediaweergaven', mode: 'daily', offset: -1, lag: 1, note: 'Volledige brondagen. Mediaweergaven omvatten organische en eventuele betaalde weergaven; geen unieke personen.' },
  instagram: { name: 'Instagram', label: 'Views', unit: 'weergaven', mode: 'window', offset: 0, lag: 0, note: 'Periodetotaal zoals Postiz het levert. Groei vergelijkt dit met een opgeslagen periodetotaal van 7 of 30 dagen eerder; geen daggrafiek beschikbaar.' },
  gmb: { name: 'Google', label: 'Website Clicks', unit: 'websiteklikken', mode: 'daily', offset: 0, lag: 3, note: 'Klikken op de websiteknop van het bedrijfsprofiel. De laatste drie dagen blijven buiten de vergelijking vanwege vertraagde brongegevens.' },
  tiktok: { name: 'TikTok', label: 'Followers', unit: 'volgers', mode: 'stock', offset: 0, lag: 0, note: 'Aantal volgers op het meetmoment. Groei is het verschil met de opgeslagen stand van 7 of 30 dagen eerder. Views van de laatste twintig video’s worden niet als weekbereik gebruikt.' },
  youtube: { name: 'YouTube', label: 'Estimated Minutes Watched', unit: 'kijkminuten', mode: 'daily', offset: 0, lag: 2, note: 'Kijktijd van het kanaal in volledige brondagen. Recente dagen kunnen vertraagd binnenkomen.' },
  'linkedin-page': { name: 'LinkedIn-bedrijf', label: 'Page Views', unit: 'paginaweergaven', mode: 'daily', offset: 0, lag: 1, note: 'Weergaven van de bedrijfspagina, niet de vertoningen van berichten. Lege bronreeksen worden niet als nul behandeld.' },
  pinterest: { name: 'Pinterest', label: 'Impressions', unit: 'vertoningen', mode: 'daily', offset: 0, lag: 1, note: 'Vertoningen volgens Pinterest. De vergelijking eindigt op de laatste beschikbare volledige brondag.' },
};
export const DAY = 86_400_000;
export function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * DAY).toISOString().slice(0, 10);
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function normalizeMetrics(input: unknown): Metric[] {
  if (!Array.isArray(input) || input.length > 40) throw new Error('metrics');
  const metrics = input.map(m => {
    if (!isRecord(m) || typeof m.label !== 'string' || m.label.length > 100 || !Array.isArray(m.data) || m.data.length > 100) throw new Error('metric');
    const data = m.data.map(p => {
      if (!isRecord(p) || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0,10) !== p.date) throw new Error('date');
      // Empty strings, nulls and booleans must never become numeric zero.
      if (typeof p.total !== 'number' && (typeof p.total !== 'string' || !/^\d+(\.\d+)?$/.test(p.total))) throw new Error('total');
      const total = Number(p.total);
      if (!Number.isFinite(total) || total < 0 || total > Number.MAX_SAFE_INTEGER) throw new Error('total');
      return { date: p.date, total };
    });
    if (new Set(data.map(p => p.date)).size !== data.length) throw new Error('duplicate date');
    return { label: m.label, data: data.sort((a,b) => a.date.localeCompare(b.date)) };
  });
  if (new Set(metrics.map(m => m.label)).size !== metrics.length) throw new Error('duplicate metric');
  return metrics;
}
export function parseIngest(input: unknown, now = new Date()) {
  if (!isRecord(input) || !Array.isArray(input.channels) || input.channels.length > 30 || !Array.isArray(input.snapshots) || input.snapshots.length > 90 || typeof input.capturedAt !== 'string') throw new Error('payload');
  const capturedAt = new Date(input.capturedAt);
  if (!Number.isFinite(capturedAt.getTime()) || Math.abs(now.getTime() - capturedAt.getTime()) > 2 * DAY) throw new Error('capturedAt');
  const channels: Channel[] = input.channels.map(c => {
    if (!isRecord(c) || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,191}$/.test(c.id) || typeof c.name !== 'string' || c.name.length > 191 || typeof c.provider !== 'string' || !(Object.hasOwn(SPECS,c.provider) || c.provider === 'linkedin') || !['ok','empty','error','disabled','unsupported'].includes(String(c.status))) throw new Error('channel');
    return { id: c.id, name: c.name, provider: c.provider, status: c.status as Channel['status'] };
  });
  if (new Set(channels.map(c => c.id)).size !== channels.length) throw new Error('duplicate channel');
  const snapshots = input.snapshots.map(s => {
    if (!isRecord(s) || typeof s.channelId !== 'string' || ![7,30,65].includes(Number(s.windowDays))) throw new Error('snapshot');
    const channel = channels.find(c => c.id === s.channelId);
    if (!channel || !SPECS[channel.provider] || channel.status === 'disabled' || channel.status === 'unsupported') throw new Error('snapshot channel');
    const metrics = normalizeMetrics(s.metrics);
    if (!metrics.some(m => m.data.length)) throw new Error('empty snapshot');
    return { channelId: channel.id, provider: channel.provider, windowDays: Number(s.windowDays), capturedAt, metrics };
  });
  if (new Set(snapshots.map(s => `${s.channelId}:${s.windowDays}`)).size !== snapshots.length) throw new Error('duplicate snapshot');
  return { channels, snapshots, capturedAt };
}
export type Comparison = {
  value: number | null; previous: number | null; delta: number | null; percent: number | null;
  start: string | null; end: string | null; previousStart: string | null; previousEnd: string | null;
  points: { date: string; total: number | null }[]; reason: string | null;
};
const empty: Comparison = { value: null, previous: null, delta: null, percent: null, start: null, end: null, previousStart: null, previousEnd: null, points: [], reason: 'Nog geen bruikbare meting.' };
export function difference(value: number, previous: number) {
  return { delta: value - previous, percent: previous === 0 ? (value === 0 ? 0 : null) : (value - previous) / previous * 100 };
}
function metric(snapshot: Snapshot, label: string) {
  return normalizeMetrics(snapshot.metrics).find(m => m.label === label)?.data || [];
}
export function compareDaily(snapshot: Snapshot, spec: MetricSpec, days: number, now = new Date()): Comparison {
  const points = metric(snapshot, spec.label).map(p => ({ ...p, date: shiftDate(p.date, spec.offset) }));
  const cutoff = shiftDate(dateKey(now), -spec.lag);
  const available = points.filter(p => p.date <= cutoff);
  if (!available.length) return { ...empty };
  const end = available[available.length - 1].date;
  const start = shiftDate(end, 1 - days), previousEnd = shiftDate(start, -1), previousStart = shiftDate(start, -days);
  const lookup = new Map(available.map(p => [p.date, p.total]));
  const series = Array.from({ length: days }, (_,i) => { const date = shiftDate(start,i); return { date, total: lookup.get(date) ?? null }; });
  const before = Array.from({ length: days }, (_,i) => lookup.get(shiftDate(previousStart,i)));
  const value = series.every(p => p.total !== null) ? series.reduce((sum,p) => sum + p.total!, 0) : null;
  const previous = before.every(v => v !== undefined) ? before.reduce<number>((sum,v) => sum + v!, 0) : null;
  return { value, previous, ...(value !== null && previous !== null ? difference(value,previous) : { delta: null, percent: null }), start, end, previousStart, previousEnd, points: series,
    reason: value === null ? 'Brongegevens voor deze periode zijn onvolledig.' : previous === null ? 'Vergelijkingsperiode nog onvolledig.' : null };
}
export function compareSnapshot(current: Snapshot, previous: Snapshot | null, spec: MetricSpec, days: number): Comparison {
  const data = metric(current, spec.label);
  if (data.length !== 1) return { ...empty };
  const end = dateKey(current.capturedAt);
  const validPrevious = previous && previous.channelId === current.channelId && previous.windowDays === current.windowDays && Math.abs(current.capturedAt.getTime() - previous.capturedAt.getTime() - days * DAY) <= 90 * 60_000;
  const old = validPrevious ? metric(previous, spec.label) : [];
  const value = data[0].total, before = old.length === 1 ? old[0].total : null;
  return { ...empty, value, previous: before, ...(before !== null ? difference(value,before) : { delta: null, percent: null }),
    start: spec.mode === 'stock' ? end : shiftDate(end,-days), end,
    previousStart: validPrevious ? shiftDate(dateKey(previous.capturedAt), spec.mode === 'stock' ? 0 : -days) : null,
    previousEnd: validPrevious ? dateKey(previous.capturedAt) : null,
    reason: before === null ? 'Vergelijking wordt opgebouwd.' : null };
}
