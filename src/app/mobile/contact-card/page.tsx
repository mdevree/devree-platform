'use client';
import {Suspense,useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {signIn,useSession} from 'next-auth/react';
import type {MauticContactFull} from '@/lib/mautic';
import type {HistoryItem} from '@/lib/contactHistory';
type Card={contact:MauticContactFull;projects:{role:string;project:{id:string;name:string;status:string}}[];notes:{notes:{id:number;text:string;dateTime:string}[];nextStart:number|null}|null;notesUnavailable:boolean};
function plain(text:string){return text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function localDate(d:Date){if(!Number.isFinite(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function CardView(){
 const params=useSearchParams(),{status,update}=useSession();
 const id=Number(params.get('id')),observedId=params.get('callId'),manual=params.get('manual')==='true'||!params.get('callId');
 const [requestId]=useState(()=>{if(observedId)return observedId;const key='mobile-manual-id:'+id;if(typeof window==='undefined')return '';const old=localStorage.getItem(key);if(old)return old;const value=crypto.randomUUID();localStorage.setItem(key,value);return value;});
 const [date,setDate]=useState(()=>localDate(new Date(params.get('startedAt')||Date.now())));
 const [direction,setDirection]=useState(params.get('direction')==='outbound'?'outbound':'inbound');
 const [card,setCard]=useState<Card|null>(null),[history,setHistory]=useState<HistoryItem[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[saved,setSaved]=useState(false),[pending,setPending]=useState(false);
 const [historyError,setHistoryError]=useState('');
 const draftKey='mobile-call-draft:'+id+':'+requestId;
 useEffect(()=>{if(status!=='authenticated'||!id)return;let current=true;
  fetch(`/api/mobile/contact-card?id=${id}`).then(async r=>{if(!r.ok)throw Error('Klantkaart kon niet worden geladen');return r.json();}).then(d=>{if(current){setCard(d);try{const v=JSON.parse(localStorage.getItem(draftKey)||'null');if(v){setNote(v.note||'');setDate(v.date||localDate(new Date()));setDirection(v.direction||'inbound');}const submitted=JSON.parse(localStorage.getItem(draftKey+':submission')||'null');if(submitted){setNote(submitted.note);setDate(localDate(new Date(submitted.startedAt)));setDirection(submitted.direction);setPending(true);setConfirmed(true);setMessage('Een eerdere opslag moet nog worden bevestigd. Probeer dezelfde notitie opnieuw.');}}catch{/* no draft */}}}).catch(e=>{if(current)setError(e.message);});
  fetch(`/api/mautic/contact/${id}/history`).then(async r=>{if(!r.ok)throw Error('Contacthistorie niet beschikbaar. Controleer recent contact voordat je opvolging afspreekt.');return r.json();}).then(d=>{if(current){setHistory(d.items);setCursor(d.nextCursor);}}).catch(e=>{if(current)setHistoryError(e.message);});
  return()=>{current=false;};
 },[status,id,draftKey]);
 async function moreHistory(){setBusy(true);try{const r=await fetch(`/api/mautic/contact/${id}/history?cursor=${encodeURIComponent(cursor||'')}`);if(!r.ok)throw Error();const d=await r.json();setHistory(h=>[...h,...d.items]);setCursor(d.nextCursor);}catch{setHistoryError('Meer historie laden mislukt');}finally{setBusy(false);}}
 async function moreNotes(){if(!card?.notes)return;setBusy(true);try{const r=await fetch(`/api/mobile/contact-card?id=${id}&start=${card.notes.nextStart}`);if(!r.ok)throw Error();const d:Card=await r.json();if(!d.notes)throw Error();setCard({...card,notes:{notes:[...card.notes.notes,...d.notes.notes],nextStart:d.notes.nextStart}});}catch{setError('Meer Mautic-notities laden mislukt');}finally{setBusy(false);}}
 function saveDraft(text:string,newDate=date,newDirection=direction){try{localStorage.setItem(draftKey,JSON.stringify({note:text,date:newDate,direction:newDirection}));}catch{setError('Concept kon niet op dit toestel worden bewaard. Houd deze pagina open tot het opslaan is bevestigd.');}}
 async function save(){setBusy(true);setError('');try{
  // Freeze the original payload so retries cannot accidentally create another note.
  let payload;const key=draftKey+':submission';try{payload=JSON.parse(localStorage.getItem(key)||'null');}catch{/* first attempt */}
  if(!payload){payload={requestId,contactId:id,direction,connected:observedId?params.get('connected')==='true':confirmed,contactConfirmed:confirmed,startedAt:!manual?params.get('startedAt'):new Date(date).toISOString(),endedAt:!manual?params.get('endedAt'):new Date(date).toISOString(),note};localStorage.setItem(key,JSON.stringify(payload));}
  const r=await fetch('/api/mobile/calls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();
  if(!r.ok){if(r.status===400){localStorage.removeItem(key);setPending(false);}throw Error(d.error||'Opslaan mislukt');}
  if(!d.mauticStored){setPending(true);setMessage(d.message);return;}
  setSaved(true);setPending(false);setMessage('Gesprek en notitie opgeslagen in platform en Mautic.');localStorage.removeItem(draftKey);localStorage.removeItem(key);if(!observedId)localStorage.removeItem('mobile-manual-id:'+id);
  const bridge=(window as unknown as {webkit?:{messageHandlers?:{callSaved?:{postMessage:(v:unknown)=>void}}}}).webkit?.messageHandlers?.callSaved;
  bridge?.postMessage({requestId,contactId:id,platformStored:true,mauticStored:true});
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(status==='loading')return <p>Inloggen controleren…</p>;
 if(status!=='authenticated')return <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{const r=await signIn('credentials',{email:f.get('email'),password:f.get('password'),redirect:false});if(r?.error)setError('Inloggen mislukt');else await update();}catch{setError('Inloggen tijdelijk niet beschikbaar');}finally{setBusy(false);}}}><h1 className="text-2xl font-bold">De Vree klantkaart</h1><p>Log in met je account van het kantoorplatform.</p><input className="w-full rounded border p-3" name="email" type="email" autoComplete="username" placeholder="E-mailadres" required/><input className="w-full rounded border p-3" name="password" type="password" autoComplete="current-password" placeholder="Wachtwoord" required/><button disabled={busy} className="rounded bg-blue-800 p-3 text-white">Inloggen</button><p role="alert">{error}</p></form>;
 if(!Number.isSafeInteger(id)||id<=0)return <p>Ongeldig contact. Open de kaart opnieuw vanuit de app.</p>;
 if(!card)return <p role="status">{error||'Klantkaart laden…'}</p>;
 let search:{activePersonalPreferences?:{label:string;hardRequirement?:boolean}[];realworks?:{summary?:string}}={};try{search=JSON.parse(card.contact.zoekerData||'{}');}catch{/* historical plain text */}
 return <div className="space-y-6">
 <header><h1 className="text-2xl font-bold">{card.contact.firstname} {card.contact.lastname}</h1><p>{card.contact.mobile||card.contact.phone} · {card.contact.email}</p></header>
 <section><h2 className="font-bold">Dossiers</h2>{card.projects.length?card.projects.map(p=><p key={p.project.id}>{p.project.name} — {p.project.status} ({p.role})</p>):<p>Geen gekoppelde dossiers gevonden.</p>}</section>
 <section><h2 className="font-bold">Woonwensen</h2><p className="whitespace-pre-wrap">{search.realworks?.summary||'Geen zoekerssamenvatting beschikbaar.'}</p>{search.activePersonalPreferences?.map((p,i)=><p key={i}>{p.label}{p.hardRequirement?' (eis)':' (voorkeur)'}</p>)}</section>
 <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-bold">Gespreksnotitie</h2>{observedId&&params.get('connected')!=='true'?<p>Deze oproep is niet als verbonden waargenomen. Hij wordt niet als gevoerd gesprek opgeslagen.</p>:<>
 {manual&&<><p>Handmatige registratie: gebruik dit alleen wanneer je de persoon daadwerkelijk hebt gesproken.</p><label className="block">Gespreksdatum<input className="block w-full border p-2" type="datetime-local" value={date} disabled={saved||pending} onChange={e=>{setDate(e.target.value);saveDraft(note,e.target.value);}}/></label><select className="border p-2" value={direction} disabled={saved||pending} onChange={e=>{setDirection(e.target.value);saveDraft(note,date,e.target.value);}}><option value="inbound">Inkomend</option><option value="outbound">Uitgaand</option></select></>}
 {!manual&&observedId&&<p>{direction==='inbound'?'Inkomend':'Uitgaand'} · {new Date(params.get('startedAt')||'').toLocaleString('nl-NL')}</p>}
 <textarea aria-label="Gespreksnotitie" className="min-h-36 w-full rounded border p-3" maxLength={10000} value={note} disabled={saved||pending} onChange={e=>{setNote(e.target.value);saveDraft(e.target.value);}} placeholder="Wat hebben jullie besproken en afgesproken? Je kunt ook de dicteerknop van je iPhone-toetsenbord gebruiken."/>
 <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={saved||pending} onChange={e=>setConfirmed(e.target.checked)}/>Ik heb deze persoon daadwerkelijk gesproken en de juiste klant geselecteerd.</label>
 <button className="rounded bg-blue-800 p-3 text-white disabled:opacity-50" disabled={busy||saved||!confirmed||!note.trim()} onClick={save}>{busy?'Opslaan…':pending?'Mautic opnieuw proberen':'Opslaan in platform en Mautic'}</button></>}
 <p role="status">{message}</p><p role="alert" className="text-red-700">{error}</p></section>
 <section className="space-y-3"><h2 className="font-bold">Contacthistorie en afspraken</h2><p className="text-red-700">{historyError}</p>{history.map(h=><article key={h.id} className="rounded border p-3"><b>{h.title}</b><p className="text-sm">{new Date(h.at).toLocaleString('nl-NL')} · {h.source}</p><p className="whitespace-pre-wrap">{h.detail}</p></article>)}{cursor&&<button disabled={busy} onClick={moreHistory}>Meer historie laden</button>}</section>
 <section className="space-y-3"><h2 className="font-bold">Mautic-notities</h2>{card.notesUnavailable&&<p>Niet beschikbaar; de contacthistorie is mogelijk onvolledig.</p>}{card.notes?.notes.map(n=><article key={n.id} className="rounded border p-3"><p>{n.dateTime}</p><p className="whitespace-pre-wrap">{plain(n.text)}</p></article>)}{card.notes?.nextStart!=null&&<button disabled={busy} onClick={moreNotes}>Meer notities laden</button>}</section>
 </div>;
}
export default function Page(){return <main className="mx-auto max-w-xl p-4"><Suspense fallback={<p>Klantkaart laden…</p>}><CardView/></Suspense></main>;}
