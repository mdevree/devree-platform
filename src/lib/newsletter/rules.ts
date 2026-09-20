import { createHash } from 'node:crypto';
export const NEWSLETTER_SEGMENT_ID = 33;
export const CONSENT_VERSION = 'faq-newsletter-2026-09-v1';
export const CONSENT_TEXT = 'Ontvang maximaal één keer per maand onze nieuwste uitleg en video’s over kopen, verkopen en taxaties. Afmelden kan altijd.';
export function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}
export function normalizeKeyword(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0,120); }
export function sensitiveKeyword(value: string): boolean { return /@|https?:|www\.|(?:\d[\s()+.-]*){7}/i.test(value); }
export function amsterdamDate(now = new Date()): string { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function reportPeriods(now = new Date()) {
  const day = new Date(amsterdamDate(now) + 'T00:00:00Z');
  const date = (offset: number) => new Date(day.getTime() + offset*86400000).toISOString().slice(0,10);
  return { current: `${date(-30)},${date(-1)}`, previous: `${date(-60)},${date(-31)}` };
}
export type RemoteEmail = { id: number; name: string; subject: string; preheaderText?: string; customHtml?: string; plainText?: string; lists?: Array<number|{id:number}>; isPublished?: boolean; sentCount?: number; publishUp?: string|null; };
export function remoteHash(email: RemoteEmail): string {
  return hash(JSON.stringify([email.subject, email.preheaderText || '', email.customHtml || '', email.plainText || '', (email.lists || []).map(l => typeof l === 'number' ? l : Number(l.id)).sort((a,b)=>a-b)]));
}
export function assertRemoteDraft(email: RemoteEmail, expectedHash?: string|null) {
  if (email.isPublished || Number(email.sentCount)>0 || email.publishUp) throw new Error('Deze editie is in Mautic geactiveerd of verzonden. Maak een nieuwe editie.');
  if (expectedHash && remoteHash(email)!==expectedHash) throw new Error('Het Mautic-concept is buiten het platform gewijzigd. Controleer het concept voordat u verdergaat.');
}
