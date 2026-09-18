"use client";
import { useCallback, useEffect, useState } from "react";
import type { PbxConfig } from "@/lib/pbx/core";
type User = { id:string; name:string };
type Row = { id:string; taskId:string|null; kind:string; phone:string|null; receivedAt:string; contactId:number|null; contactName:string|null; notes:string|null; consentAt:string|null; conversationId:string|null; recordingHash:string|null; recordingDeletedAt:string|null; task:{status:string;dueDate:string|null;assigneeId:string;assignee:User}|null; messages:{status:string;delivery:string|null;error:string|null}[] };
type ConfigResponse = { config:PbxConfig; effectiveMode:string; sendMode:string; heartbeat:{checkedAt:string;appliedVersion:number;pending:number;audioReady:boolean;storageReady:boolean;asteriskReady:boolean;testRouteOnly:boolean}|null };
const statusLabels:Record<string,string>={open:"Open",bezig:"In behandeling",wacht_op_klant:"Wacht op klant",afgerond:"Afgerond"};
const messageLabels:Record<string,string>={pending:"Wacht op verzending",sending:"Verzenden",sent:"Verzonden aan provider",uncertain:"Uitkomst onzeker — controleer WhatsApp",failed:"Mislukt",DELIVERED:"Afgeleverd",READ:"Gelezen"};
function localInput(iso:string|null) { if (!iso) return ""; const d=new Date(iso); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
const field="rounded border border-gray-300 px-2 py-1.5 text-sm";
export default function PbxReception() {
  const [data,setData]=useState<ConfigResponse|null>(null),[rows,setRows]=useState<Row[]>([]),[users,setUsers]=useState<User[]>([]);
  const [tab,setTab]=useState("active"),[page,setPage]=useState(1),[total,setTotal]=useState(0),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [until,setUntil]=useState(""),[closed,setClosed]=useState(""),[owner,setOwner]=useState("");
  const load=useCallback(async()=>{
    try {
      const [c,r,u]=await Promise.all([fetch('/api/pbx/config'),fetch(`/api/pbx/requests?status=${tab}&page=${page}`),fetch('/api/users')]);
      if (!c.ok||!r.ok||!u.ok) throw new Error("PBX-gegevens konden niet worden geladen");
      setData(await c.json());const result=await r.json();setRows(result.rows);setTotal(result.total);setUsers((await u.json()).users);
    } catch(e) {setError(e instanceof Error?e.message:"Laden mislukt");}
  },[tab,page]);
  useEffect(()=>{ void load(); const t=setInterval(()=>void load(),15000);return()=>clearInterval(t);},[load]);
  async function mutate(url:string,body:object) {
    setBusy(true);setError("");
    try {const r=await fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw new Error((await r.json().catch(()=>null))?.error||"Opslaan mislukt");await load();}
    catch(e){setError(e instanceof Error?e.message:"Opslaan mislukt");}finally{setBusy(false);}
  }
  const hb=data?.heartbeat;
  const healthy=hb&&Date.now()-Date.parse(hb.checkedAt)<90000&&hb.audioReady&&hb.storageReady&&hb.asteriskReady&&hb.appliedVersion===data?.config.version;
  const groups=new Map<string,Row[]>();for(const row of rows){const key=row.taskId||row.id;groups.set(key,[...(groups.get(key)||[]),row]);}
  return <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5" aria-label="PBX-opvang">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">PBX-opvang</h2><span className={`rounded-full px-3 py-1 text-sm ${healthy?'bg-green-50 text-green-800':'bg-amber-50 text-amber-800'}`}>{healthy?"PBX verbonden":"PBX controleren"}{hb?` · ${hb.pending} wachtend`:" · nog geen terugmelding"}</span></div>
    {error&&<p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
    {data&&<>
      <p className="mt-2 text-sm text-gray-600">{hb?.testRouteOnly!==false?"Testroute — het hoofdnummer is nog niet omgeschakeld.":"PBX-opvang actief op de ingestelde belroute."} WhatsApp: {data.sendMode==='off'?"verzending uit":data.sendMode==='test'?"alleen testnummers":"actief"}. AI-belassistent uit.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div><p className="text-sm font-medium">Stand: {data.effectiveMode==='closed'?"Gesloten":data.effectiveMode==='away'?"Buiten de deur":"Beschikbaar"}</p>{data.config.mode==='away'&&data.config.awayUntil&&<p className="text-xs text-gray-500">Buiten de deur tot {new Date(data.config.awayUntil).toLocaleString('nl-NL')}</p>}</div>
        <button disabled={busy} className={field} onClick={()=>mutate('/api/pbx/config',{...data.config,mode:'available',awayUntil:null})}>Beschikbaar</button>
        <label className="text-sm">Buiten de deur tot<input aria-label="Eindtijd buiten de deur" type="datetime-local" className={`ml-2 ${field}`} value={until} onChange={e=>setUntil(e.target.value)}/></label>
        <button disabled={busy||!until} className="rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-50" onClick={()=>mutate('/api/pbx/config',{...data.config,mode:'away',awayUntil:new Date(until).toISOString()})}>Buiten de deur</button>
      </div>
      <details className="mt-4 text-sm"><summary className="cursor-pointer">Openingstijden en opvolging</summary><p className="my-2 text-gray-600">Ma–vr 09:00–17:30 · za 10:00–13:00 · zo gesloten. Bij beschikbaarheid rinkelen de toestellen 20 seconden. Afwijkende sluitingsdagen hieronder.</p>
        <div className="flex flex-wrap items-end gap-3"><label>Verantwoordelijke<select className={`ml-2 ${field}`} value={owner||data.config.ownerId||''} onChange={e=>setOwner(e.target.value)}><option value="">Melvin (automatisch)</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label>Sluitingsdagen (JJJJ-MM-DD, één per regel)<textarea className={`block ${field}`} placeholder={data.config.closedDates.join('\n')||'Geen uitzonderingen'} value={closed} onChange={e=>setClosed(e.target.value)}/></label>
        <button disabled={busy} className={field} onClick={()=>mutate('/api/pbx/config',{...data.config,ownerId:owner||data.config.ownerId,closedDates:closed.trim()?closed.split(/[\s,]+/).filter(Boolean):data.config.closedDates})}>Instellingen opslaan</button>
        {data.config.closedDates.length>0&&<button disabled={busy} className={field} onClick={()=>mutate('/api/pbx/config',{...data.config,closedDates:[]})}>Sluitingsdagen wissen</button>}</div>
      </details>
    </>}
    <div className="mt-5 flex gap-2 border-t pt-4">{[['active','Terugbellen'],['done','Afgerond'],['information','Informatie en gemist']].map(([value,label])=><button key={value} className={`rounded px-3 py-2 text-sm ${tab===value?'bg-primary text-white':'bg-gray-100'}`} onClick={()=>{setTab(value);setPage(1);}}>{label}</button>)}</div>
    <div className="mt-3 space-y-3">{[...groups].map(([key,calls])=>{const first=calls[0];return <article key={key} className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{first.contactName||first.phone||"Nummer ontbreekt — uitzoeken"}</strong> <span className="text-sm text-gray-500">{first.contactName&&first.phone} · {calls.length} {calls.length===1?'oproep':'oproepen'}</span></div>
      {first.task&&<div className="flex flex-wrap gap-2"><select aria-label="Status terugbeltaak" disabled={busy} className={field} value={first.task.status} onChange={e=>mutate(`/api/pbx/requests/${first.id}`,{status:e.target.value})}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select aria-label="Verantwoordelijke terugbeltaak" disabled={busy} className={field} value={first.task.assigneeId} onChange={e=>mutate(`/api/pbx/requests/${first.id}`,{assigneeId:e.target.value})}>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><input aria-label="Opvolgen uiterlijk" className={field} type="datetime-local" defaultValue={localInput(first.task.dueDate)} key={first.task.dueDate} onBlur={e=>{if(e.target.value&&new Date(e.target.value).toISOString()!==first.task?.dueDate)void mutate(`/api/pbx/requests/${first.id}`,{dueDate:new Date(e.target.value).toISOString()});}}/></div>}</div>
      {calls.map(r=><div key={r.id} className="mt-3 border-t pt-2 text-sm"><p>{new Date(r.receivedAt).toLocaleString('nl-NL')} · {r.kind==='callback'?'Terugbelverzoek':r.kind==='viewing'?'Woninglink':'Gemiste oproep'} · {r.consentAt?'WhatsApp gevraagd':'Geen WhatsApp gevraagd'}</p>
        {r.messages.map((m,i)=><p key={i} className={m.status==='uncertain'||m.status==='failed'?'text-amber-800':'text-gray-600'}>WhatsApp: {messageLabels[m.delivery==='READ'||m.delivery==='DELIVERED'?m.delivery:m.status]||m.status}{m.error?` — ${m.error}`:''}</p>)}
        {r.recordingDeletedAt?<p className="text-gray-500">Opname verwijderd na bewaartermijn.</p>:r.recordingHash?<audio className="my-2 max-w-full" controls preload="none" src={`/api/pbx/requests/${r.id}/recording`}/>:<p className="text-gray-500">Geen opname beschikbaar.</p>}
        <div className="my-2 flex flex-wrap gap-4">{r.phone&&<a className="text-primary underline" href={`tel:${r.phone}`}>Terugbellen</a>}{r.conversationId&&<a className="text-primary underline" href={`/whatsapp?conversation=${r.conversationId}`}>Open WhatsApp</a>}{r.contactId&&<a className="text-primary underline" href={`/contacten?contactId=${r.contactId}`}>Contact</a>}{calls.length>1&&<button disabled={busy} className="text-primary underline" onClick={()=>mutate(`/api/pbx/requests/${r.id}`,{split:true})}>Apart onderwerp maken</button>}</div>
        <details><summary className="cursor-pointer">Notitie en contactkoppeling</summary><textarea aria-label="Notitie terugbelverzoek" className={`mt-2 block w-full ${field}`} key={r.notes} defaultValue={r.notes||''} placeholder="Onderwerp of resultaat van het terugbellen" onBlur={e=>{if(e.target.value!==(r.notes||''))void mutate(`/api/pbx/requests/${r.id}`,{notes:e.target.value});}}/>
        <form className="mt-2 flex gap-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(`/api/pbx/requests/${r.id}`,{contactId:Number(f.get('contactId'))});}}><input className={field} name="contactId" type="number" min="1" required placeholder="Mautic-contactnummer" aria-label="Mautic-contactnummer"/><button disabled={busy} className={field}>Contact koppelen</button></form></details>
      </div>)}
    </article>;})}{rows.length===0&&<p className="py-4 text-sm text-gray-500">Geen verzoeken in dit overzicht.</p>}</div>
    <div className="mt-4 flex items-center gap-3 text-sm"><button className={field} disabled={page===1} onClick={()=>setPage(page-1)}>Vorige</button><span>{total} oproepen · pagina {page}</span><button className={field} disabled={page*50>=total} onClick={()=>setPage(page+1)}>Volgende</button></div>
  </section>;
}
