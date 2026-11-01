export const CHANNELS = ['facebook','instagram','youtube','tiktok','gmb','linkedin-page','linkedin','pinterest','other'] as const;
export const KINDS = ['photo','carousel','video','reel','story','unknown'] as const;
export const channelNames: Record<string,string> = {facebook:'Facebook',instagram:'Instagram',youtube:'YouTube',tiktok:'TikTok',gmb:'Google Bedrijfsprofiel','linkedin-page':'LinkedIn bedrijf',linkedin:'LinkedIn persoonlijk',pinterest:'Pinterest',other:'Overig'};
export const kindNames: Record<string,string> = {photo:'Foto',carousel:'Carrousel',video:'Video',reel:'Reel',story:'Verhaal',unknown:'Onbekend'};
export function text(value: unknown, max = 20000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Ongeldige tekst');
  return value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
}
export function url(value: unknown): string | null {
  if (!value) return null;
  if(typeof value !== 'string' || value.length > 3000) throw new Error('Ongeldige link');
  const u = new URL(value);
  if(u.protocol !== 'https:' || u.username || u.password) throw new Error('Gebruik een https-link');
  u.hash=''; ['fbclid','igsh','utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(k=>u.searchParams.delete(k));
  return u.toString().replace(/\/$/,'');
}
export function date(value: unknown): Date | null {
  if(value == null || value === '') return null;
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Ongeldige datum');
  return new Date(value);
}
export function counted(p: {everPublished:boolean;excluded:boolean}) {return p.everPublished && !p.excluded;}
export function publicationKey(channel: string, accountId: string, releaseId: string | null, releaseUrl: string | null) {
  return releaseId ? `${channel}:${accountId}:${releaseId}` : releaseUrl ? `${channel}:${releaseUrl}` : null;
}
export function normalized(s: string) {return s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
export function matchProjects(row: {realworksId?:string|null;content:string}, projects: {id:string;realworksId:string|null;woningAdres:string|null;address:string|null}[]) {
  if(row.realworksId) { const found=projects.filter(p=>p.realworksId===row.realworksId); return found.length===1 ? [found[0].id] : []; }
  const body=` ${normalized(row.content)} `;
  const candidates=projects.filter(p=>{const a=normalized(p.woningAdres || p.address || '');return /\d/.test(a) && a.length>5 && body.includes(` ${a} `);});
  // Ambiguous matches require a human; never guess between projects for the same home.
  return candidates.length===1 ? [candidates[0].id] : [];
}
export function findExternalMatch<T extends {externalKey:string|null;releaseUrl:string|null;source:string}>(items:T[],key:string|null,releaseUrl:string|null):T|undefined {
  const exact=items.find(p=>!!key && p.externalKey===key);
  if(exact)return exact;
  const generic=releaseUrl && (/^https:\/\/business\.google\.com\/locations\/[^/]+$/.test(releaseUrl) || /^https:\/\/(www\.)?tiktok\.com\/messages/.test(releaseUrl));
  return !generic && releaseUrl ? items.find(p=>p.source==='manual' && p.releaseUrl===releaseUrl) : undefined;
}
export type ImportRow = ReturnType<typeof parseRow>;
export function parseRow(v: Record<string,unknown>) {
  const channel=text(v.channel,40), kind=text(v.kind,30), state=text(v.state,30);
  if(!CHANNELS.includes(channel as typeof CHANNELS[number]) || !KINDS.includes(kind as typeof KINDS[number]) || !['PUBLISHED','QUEUE','DRAFT','ERROR'].includes(state)) throw new Error('Onbekend kanaal, type of status');
  const sourceId=text(v.sourceId,100), accountId=text(v.accountId,100);
  if(!sourceId || !accountId) throw new Error('ID ontbreekt');
  const rawId=v.releaseId ? text(v.releaseId,200):null;
  const releaseId=rawId && !['missing','undefined','null'].includes(rawId)?rawId:null;
  const rawUrl=url(v.releaseUrl);
  const releaseUrl=rawUrl && (/^https:\/\/(www\.)?tiktok\.com\/messages/.test(rawUrl) || /^https:\/\/business\.google\.com\/locations\/[^/]+$/.test(rawUrl))?null:rawUrl;
  return {sourceId,accountId,channel,kind,state,account:text(v.account,200),content:text(v.content),scheduledAt:date(v.scheduledAt),publishedAt:date(v.publishedAt),releaseId,releaseUrl,mediaUrl:url(v.mediaUrl),sourceUrl:url(v.sourceUrl),removed:v.removed===true,realworksId:v.realworksId?text(v.realworksId,100):null};
}
