"use client";
import { useEffect, useState } from "react";

type Metric={days:number;eligible:number;confirmed:number;percent:number|null;medianLeadDays:number|null};
type Signal={id:string;postcode:string;houseNumber:string;houseLetter:string|null;houseAddition:string|null;detail:string|null;street:string|null;city:string|null;label:string;previousLabel:string|null;registeredAt:string;detectedAt:string;baseline:boolean;status:string;listingKind:string|null;firstListedAt:string|null;areaStatus:string;groupSize:number;buildingStatus:string|null};
type Data={signals:Signal[];total:number;page:number;pageSize:number;cities:string[];metrics:Metric[];counts:{unseen:number;listed:number;baseline:number;pending:number};health:{status:string;stale:boolean;throughDate?:string;lastSuccessAt?:string;historyGap?:boolean;pendingAddresses?:number;error?:string};breakdown:{city:string;metrics:Metric[]}[];groupedMetrics:Metric[];singleMetrics:Metric[]};
const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat("nl-NL",{day:"numeric",month:"short",year:"numeric",timeZone:"Europe/Amsterdam"}).format(new Date(value)):"—";
function status(s:Signal) {
  if(s.areaStatus==="pending") return "Adrescontrole nodig";
  if(s.status==="known") return "Al bekend bij ontdekking";
  if(s.status==="withdrawn") return "Vervangen, vervallen of ingetrokken";
  if(s.status==="listed") return s.listingKind==="sale"?"Later te koop verschenen":s.listingKind==="rent"?"Later als huur verschenen":"Later aanbod; type onbekend";
  return "Nog niet in aanbod gezien";
}
function percent(m:Metric|undefined) { return m?.percent===null || !m ? "Nog geen volledige meetperiode" : `${m.percent}% (${m.confirmed}/${m.eligible})`; }

export default function EnergyLabelMonitor() {
  const [data,setData]=useState<Data|null>(null);
  const [days,setDays]=useState("90"),[city,setCity]=useState(""),[filter,setFilter]=useState("all"),[page,setPage]=useState(1);
  const [registrations,setRegistrations]=useState("single");
  const [refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
  useEffect(()=>{
    const abort=new AbortController();
    fetch(`/api/energy-labels?${new URLSearchParams({days,city,status:filter,registrations,page:String(page)})}`,{signal:abort.signal})
      .then(async r=>{if(!r.ok)throw new Error("Het overzicht kon niet worden geladen.");return r.json();})
      .then(d=>{setData(d);setError(null);setLoading(false);})
      .catch(e=>{if(e.name!=="AbortError"){setError(e.message);setLoading(false);}});
    return ()=>abort.abort();
  },[days,city,filter,registrations,page,refresh]);
  function change(fn:()=>void) {setLoading(true);setPage(1);fn();}
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-gray-900">Vroege signalen</h1><p className="mt-1 text-sm text-gray-600">Recente energielabelregistraties in ons werkgebied.</p></div><button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" disabled={loading} onClick={()=>{setLoading(true);setRefresh(r=>r+1);}}>Overzicht verversen</button></div>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">Een nieuw energielabel kan voorafgaan aan verkoop, maar ook aan verhuur of verduurzaming. Dit zijn geregistreerde labels, geen aanvragen of bevestigde verkoopplannen. We meten welke adressen later in onze verkoopmutaties verschijnen.</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {data && <>
      <div className={`rounded-lg border p-3 text-sm ${data.health.stale || data.health.status!=="ok"?"border-amber-200 bg-amber-50 text-amber-900":"border-gray-200 bg-white text-gray-600"}`}>
        Bron verwerkt t/m <strong>{date(data.health.throughDate)}</strong> · Laatste geslaagde import: {date(data.health.lastSuccessAt)} · Dagelijks rond 07.00 uur.
        {(data.health.stale || data.health.status!=="ok") && <p className="mt-1 font-medium">De gegevens zijn nog niet volledig bijgewerkt. {data.health.error?"De laatste import is niet geslaagd; zie Systeemcontrole.":"De eerste import of een volgende bronpublicatie wordt afgewacht."}</p>}
        {data.health.historyGap && <p className="mt-1">Er ontbreekt een deel van de bronhistorie. Herstelde gegevens gelden als startvoorraad.</p>}
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm">Plaats<select className="ml-2 rounded border p-2" value={city} onChange={e=>change(()=>setCity(e.target.value))}><option value="">Hele werkgebied</option>{data.cities.map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="text-sm">Registratieperiode<select className="ml-2 rounded border p-2" value={days} onChange={e=>change(()=>setDays(e.target.value))}>{[30,60,90,180,365].map(d=><option key={d} value={d}>Laatste {d} dagen</option>)}</select></label>
        <label className="text-sm">Aanbodstatus<select className="ml-2 rounded border p-2" value={filter} onChange={e=>change(()=>setFilter(e.target.value))}><option value="all">Alles</option><option value="unseen">Nog niet gezien</option><option value="known">Al bekend</option><option value="listed">Later verschenen</option><option value="withdrawn">Vervallen / vervangen</option></select></label>
        <label className="text-sm">Registraties<select className="ml-2 rounded border p-2" value={registrations} onChange={e=>change(()=>setRegistrations(e.target.value))}><option value="single">Zonder groepsregistraties</option><option value="grouped">Alleen groepsregistraties</option><option value="all">Alle registraties</option></select></label>
      </div>
      <p className="text-xs text-gray-500">Groepsregistraties zijn minstens vijf adressen in dezelfde straat en plaats op dezelfde dag. Ze staan standaard buiten het overzicht, maar blijven gevolgd worden. Dit patroon kan op een gezamenlijke labelronde wijzen; huur is niet bevestigd.</p>
      <div className="grid gap-3 sm:grid-cols-3">{data.metrics.map(m=><div key={m.days} className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-500">Te koop gezien binnen {m.days} dagen</p><p className="mt-2 text-xl font-semibold">{m.percent===null?"Nog in opbouw":`${m.percent}%`}</p><p className="mt-1 text-xs text-gray-500">{m.confirmed} van {m.eligible} signalen met een volledige meetperiode</p>{m.medianLeadDays!==null && <p className="mt-1 text-xs">Mediane voorsprong: {m.medianLeadDays} dagen</p>}</div>)}</div>
      <p className="text-xs text-gray-500">De meting gebruikt later ontdekte signalen van bestaande woningen die bij ontdekking nog niet in aanbod waren. Startvoorraad en onzekere adreskoppelingen tellen niet mee. Niet waargenomen betekent niet dat een woning niet is verkocht. De meting volgt de gekozen plaats en soort registratie, onafhankelijk van registratieperiode en aanbodstatus.</p>
      <div className="overflow-x-auto rounded-xl border bg-white" aria-busy={loading}>
        <div className="border-b px-4 py-3 text-sm text-gray-600">{loading?"Laden…":`${data.total} registraties · ${data.counts.unseen} nog niet in aanbod gezien · ${data.counts.baseline} startvoorraad · ${data.counts.pending} adrescontrole`}</div>
        <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Woning","Label","Geregistreerd","Ontdekt","Aanbodstatus"].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{data.signals.map(s=><tr key={s.id} className="border-t align-top">
          <td className="px-4 py-3"><div className="font-medium text-gray-900">{s.street||s.postcode} {s.houseNumber}{s.houseLetter}{s.houseAddition?`-${s.houseAddition}`:""}</div><div className="text-xs text-gray-500">{s.postcode} · {s.city||"Plaats nog te controleren"}</div>{s.detail && <div className="text-xs text-amber-700">Deel van gebouw: {s.detail}</div>}{s.groupSize>=5 && <div className="mt-1 text-xs text-amber-700">{s.groupSize} registraties in deze straat op dezelfde dag</div>}{s.buildingStatus!=="Bestaand" && <div className="text-xs text-gray-500">{s.buildingStatus||"Bouwstatus onbekend"}</div>}</td>
          <td className="px-4 py-3"><strong>{s.label}</strong><div className="text-xs text-gray-500">{s.previousLabel?`Eerder: ${s.previousLabel}`:"Vorig label onbekend"}</div></td>
          <td className="whitespace-nowrap px-4 py-3">{date(s.registeredAt)}</td><td className="whitespace-nowrap px-4 py-3">{date(s.detectedAt)}{s.baseline && <div className="text-xs text-gray-500">Startvoorraad</div>}</td>
          <td className="px-4 py-3"><span className={s.listingKind==="sale"?"font-medium text-emerald-700":"text-gray-700"}>{status(s)}</span>{s.firstListedAt && <div className="text-xs text-gray-500">Waargenomen op {date(s.firstListedAt)}</div>}</td>
        </tr>)}</tbody></table>{!data.signals.length && <p className="p-8 text-center text-gray-500">Geen registraties binnen deze selectie.</p>}
        <div className="flex items-center justify-between border-t p-3 text-sm"><button disabled={page===1||loading} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>{setLoading(true);setPage(p=>p-1);}}>Vorige</button><span>Pagina {page} van {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><button disabled={page*data.pageSize>=data.total||loading} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>{setLoading(true);setPage(p=>p+1);}}>Volgende</button></div>
      </div>
      <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-medium">Vergelijk resultaten per plaats en soort registratie</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Plaats / groep</th>{[30,60,90].map(d=><th key={d}>{d} dagen</th>)}</tr></thead><tbody>{[...data.breakdown,{city:"Zonder groepsregistraties",metrics:data.singleMetrics},{city:"Groepsregistraties (5 of meer)",metrics:data.groupedMetrics}].map(r=><tr key={r.city} className="border-t"><td className="py-2">{r.city}</td>{r.metrics.map(m=><td key={m.days} className="pr-3 text-xs">{percent(m)}</td>)}</tr>)}</tbody></table></div></details>
      <p className="text-xs text-gray-500">Bronnen: <a className="underline" href="https://www.ep-online.nl/PublicData" target="_blank" rel="noreferrer">EP-Online / RVO</a> en BAG via PDOK. Gebied: Nissewaard, Voorne aan Zee, Rozenburg, Pernis en Hoogvliet.</p>
    </>}
    {!data && loading && <p className="text-gray-500">Energielabels laden…</p>}
  </div>;
}
