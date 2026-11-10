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
  if((typeof p.value==='boolean'&&!p.value&&p.operation!=='remove')||p.scope!=='general'||(p.confidence||0)<0.9||p.key==='other')review.push(p);else accepted.push(p);
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
export type PropertyEvidence={text:string;bedrooms?:number|null;price?:number|null;livingArea?:number|null;city?:string|null};
function boolEvidence(text:string,key:string):boolean|null{
 const patterns:Record<string,[RegExp,RegExp]>={
 private_parking:[/\b(parkeren op eigen terrein|eigen (oprit|parkeerplaats|parkeergelegenheid)|priv[eé]parkeerplaats)\b/i,/\b(geen|zonder) (eigen )?(oprit|parkeerplaats|parkeergelegenheid)\b/i],
 ev_charging:[/\b(laadpaal|laadpunt|oplaadmogelijkheid)\b/i,/\b(geen|zonder) (eigen )?(laadpaal|laadpunt|oplaadmogelijkheid)\b/i],
 tool_storage:[/\b(werkplaats|klusruimte)\b/i,/\b(geen|zonder) (berging|schuur|garage|klusruimte|werkplaats)\b/i],
 garage:[/\bgarage\b/i,/\b(geen|zonder) (eigen )?garage\b/i],
 garden:[/\b(achtertuin|voortuin|zijtuin|eigen tuin)\b/i,/\b(geen|zonder) (eigen )?tuin\b/i],
 };
 const pair=patterns[key];if(!pair)return null;
 // Both positive and negative mentions may concern different features; never force a conclusion.
 const negative=pair[1].test(text);const stripped=text.replace(new RegExp(pair[1].source,'gi'),'');
 if(negative)return pair[0].test(stripped)?null:false;
 return pair[0].test(text)?true:null;
}
export function evaluatePreferences(preferences:Preference[],property:PropertyEvidence){
 const matched:string[]=[],conflicts:string[]=[],unknown:string[]=[];let hardConflict=false;
 for(const p of preferences){let value:boolean|null=null;
  if(p.key==='bedrooms'&&typeof p.value==='number'&&property.bedrooms!=null)value=property.bedrooms>=p.value;
  else if(p.key==='budget_max'&&typeof p.value==='number'&&property.price!=null)value=property.price<=p.value;
  else if(p.key==='living_space'&&typeof p.value==='number'&&property.livingArea!=null)value=property.livingArea>=p.value;
  else if(p.key==='location'&&typeof p.value==='string'&&property.city)value=property.city.toLowerCase()===p.value.toLowerCase()?true:null;
  else value=boolEvidence(property.text,p.key);
  if(value!==null&&p.polarity==='avoid')value=!value;
  if(value===null)unknown.push(p.label);
  else if(value)matched.push(p.label);
  else {conflicts.push(p.label);if(p.hardRequirement)hardConflict=true;}
 }
 return {matched,conflicts,unknown,hardConflict,reason:[matched.length?'Onderbouwd passend: '+matched.join(', '):'',conflicts.length?'Past niet bij opgegeven voorkeur: '+conflicts.join(', '):'',unknown.length?'Nog controleren: '+unknown.join(', '):''].filter(Boolean).join('. ')};
}
