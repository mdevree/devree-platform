import { createHash } from 'node:crypto';
export type MobileCallInput={requestId:string;contactId:number;direction:'inbound'|'outbound';connected:boolean;contactConfirmed:boolean;startedAt:string;endedAt:string;note:string};
export function validateMobileCall(raw:unknown,now=Date.now()):MobileCallInput {
 if(!raw||typeof raw!=='object')throw Error('Ongeldig gesprek');
 const v=raw as MobileCallInput;
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.requestId||'')||!Number.isSafeInteger(v.contactId)||v.contactId<=0)throw Error('Ongeldig contact of gesprek');
 if(!['inbound','outbound'].includes(v.direction)||v.connected!==true||v.contactConfirmed!==true)throw Error('Bevestig een daadwerkelijk gevoerd gesprek en de juiste persoon');
 const start=Date.parse(v.startedAt),end=Date.parse(v.endedAt);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end>now+300000||end-start>86400000)throw Error('Ongeldige gesprekstijden');
 if(typeof v.note!=='string'||!v.note.trim()||v.note.length>10000)throw Error('Schrijf een notitie van maximaal 10.000 tekens');
 return {requestId:v.requestId.toLowerCase(),contactId:v.contactId,direction:v.direction,connected:true,contactConfirmed:true,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),note:v.note.trim()};
}
export function mobileCallHash(v:MobileCallInput){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
export function mobileNoteMarker(id:string){return `[MauticCaller:${id}]`;}
export function mobileNoteText(v:MobileCallInput,author:string){
 const text=`${v.direction==='inbound'?'Inkomend':'Uitgaand'} mobiel gesprek — door ${author} bevestigd.\n${v.startedAt}\n\n${v.note}\n\n${mobileNoteMarker(v.requestId)}`;
 return '<p>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')+'</p>';
}
export type NoteDeliveryIO={find:()=>Promise<number|null>;create:()=>Promise<number>;verify:(id:number)=>Promise<boolean>;beforeCreate:()=>Promise<void>};
export async function deliverMobileNote(io:NoteDeliveryIO,attemptedAt:number|undefined,now=Date.now()){
 const existing=await io.find();
 if(existing){if(!await io.verify(existing))throw Error('Mautic readback failed');return existing;}
 // A timed-out request may still be committing. Do not immediately repeat it.
 if(attemptedAt && now-attemptedAt<60000)throw Error('Mautic retry pending');
 await io.beforeCreate();
 const id=await io.create();
 if(!await io.verify(id))throw Error('Mautic readback failed');
 return id;
}
