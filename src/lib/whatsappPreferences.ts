import { createHash } from 'node:crypto';
export const PREFERENCE_KEYS=['private_parking','ev_charging','tool_storage','garage','garden','bedrooms','budget_max','location','condition','living_space','accessibility','other'] as const;
export type Preference={key:string;label:string;value?:string|number|boolean;operation?:'set'|'remove';polarity?:'want'|'avoid';hardRequirement:boolean;strength:string;quote?:string;confidence?:number;scope?:string};
export type PreferenceEvent={source:string;messageId:string;receivedAt:string;sourceText:string;preferences:Preference[];review?:unknown[];summary?:string};
export function sourceHash(text:string){return createHash('sha256').update(text).digest('hex');}
export function parseExtraction(raw:string,body:string){
 const data=JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 if(!Array.isArray(data.preferences)||data.preferences.length>20)throw Error('Invalid preference response');
 const accepted:Preference[]=[],review:Preference[]=[];
 for(const item of data.preferences){
  if(!PREFERENCE_KEYS.includes(item.key)||typeof item.label!=='string'||item.label.length>150||typeof item.quote!=='string'||!item.quote.trim()||!body.includes(item.quote)||!['set','remove'].includes(item.operation)||!['want','avoid'].includes(item.polarity)||!['general','property_specific','unclear'].includes(item.scope)||typeof item.confidence!=='number'||item.confidence<0||item.confidence>1||typeof item.hardRequirement!=='boolean'||!['string','number','boolean'].includes(typeof item.value))throw Error('Invalid or ungrounded preference');
  if(typeof item.value==='string'&&item.value.length>300)throw Error('Preference too long');
  if(item.operation==='set'&&['bedrooms','budget_max','living_space'].includes(item.key)&& (typeof item.value!=='number'||!Number.isFinite(item.value)||item.value<0))throw Error('Invalid numeric preference');
  const explicitHard=/\b(moet|vereist|vereiste|eis|absoluut|noodzakelijk|uitsluitend|minimaal|maximaal)\b/i.test(item.quote)&& !/\b(neig|voorkeur|liefst|niet per se|geen eis|hoeft niet)\b/i.test(item.quote);
  const p:Preference={...item,hardRequirement:item.hardRequirement&&explicitHard,strength:item.hardRequirement&&explicitHard?'requirement':'preference'};
  const unsupportedRange = p.operation !== 'remove' && ((['bedrooms','living_space'].includes(p.key) && /\b(maximaal|hooguit|ten hoogste|niet meer dan|minder dan)\b/i.test(p.quote||'')) || (p.key==='budget_max' && /\b(minimaal|minstens|vanaf|ten minste|meer dan)\b/i.test(p.quote||'')));
  if(unsupportedRange||(typeof p.value==='boolean'&&!p.value&&p.operation!=='remove')||p.scope!=='general'||(p.confidence||0)<0.9||p.key==='other')review.push(p);else accepted.push(p);
 }
 return {preferences:accepted,review};
}
export function activePreferences(events:PreferenceEvent[]){
 const result=new Map<string,Preference>();
 for(const e of [...events].sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.messageId.localeCompare(b.messageId)))for(const p of e.preferences){
  if(p.operation==='remove')result.delete(p.key);else result.set(p.key,p);
 }
 return [...result.values()];
}
/** Supplemental context, never an alternative match score or property filter. */
export function preferenceContext(preferences:Preference[]) {
 if(!preferences.length)return '';
 return '. Woonwensen uit WhatsApp: '+preferences.map(p=>(p.polarity==='avoid'?'Niet gewenst: ':'')+p.label+(p.hardRequirement?' (expliciete eis)':' (voorkeur)')).join('; ')+'. Ter context bij de Realworks-match; geen afzonderlijke woningbeoordeling.';
}
