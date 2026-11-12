"use client";
import {useEffect, useState} from "react";
import {leegVerslag, verkoopstatussen, type Invoer, type Verslag} from "@/lib/bezichtigingsverslag";

export default function Bezichtigingsverslag({id,contactId,naam}: {id:string;contactId:number|null;naam:string|null}) {
  const [invoer,setInvoer] = useState<Invoer>(leegVerslag);
  const [verslag,setVerslag] = useState<Verslag|null>(null);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [melding,setMelding] = useState("");
  const url = "/api/agenda/" + encodeURIComponent(id) + "/verslag";
  useEffect(() => {
    const controller = new AbortController();
    fetch(url,{signal:controller.signal,cache:"no-store"}).then(async r => {
      if (!r.ok) throw Error();
      const {verslag:v} = await r.json();
      if (controller.signal.aborted) return;
      setVerslag(v); setInvoer(v?.invoer || leegVerslag); setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setMelding("Het opgeslagen verslag kon niet worden geladen. Open de afspraak opnieuw."); });
    return () => controller.abort();
  },[url]);
  async function save(actie: "concept"|"verwerk") {
    setBusy(true); setMelding("");
    try {
      const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actie,invoer,contactId,versie:verslag?.versie ?? 0})});
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Opslaan mislukt.");
      setVerslag(data.verslag); setInvoer(data.verslag.invoer);
      setMelding(data.melding || (data.verslag.status === "concept" ? "Concept opgeslagen bij deze afspraak." : "Opgeslagen bij de afspraak en in Mautic."));
    } catch(e) { setMelding(e instanceof Error ? e.message : "Opslaan niet bevestigd."); }
    finally {setBusy(false);}
  }
  function change(k:keyof Invoer,value:string) {setInvoer(previous=>({...previous,[k]:value})); setMelding("Wijzigingen nog niet opgeslagen.");}
  const locked = busy || !ready || verslag?.status === "verwerken" || verslag?.status === "verwerkt";
  const inputClass = "mt-1 w-full rounded-lg border bg-white p-2 text-base";
  return <section className="rounded-xl border p-4">
    <h3 className="font-semibold">Bezichtigingsverslag</h3>
    {verslag?.status === "verwerkt" && <p>Verwerkt in Mautic.</p>}
    <fieldset disabled={locked} className="mt-3 space-y-3">
      <label className="block">Reactie en vragen van de kijker<textarea className={inputClass} rows={4} maxLength={8000} value={invoer.notities} onChange={e=>change("notities",e.target.value)}/></label>
      <label className="block">Interesse (0–100)<input className={inputClass} type="number" min="0" max="100" inputMode="numeric" value={invoer.interesse} onChange={e=>change("interesse",e.target.value)}/></label>
      <label className="block">Verkoopgesprek<select className={inputClass} value={invoer.verkoopstatus} onChange={e=>change("verkoopstatus",e.target.value)}><option value="">Geen status ingevuld</option>{Object.entries(verkoopstatussen).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      <label className="block">Afgesproken vervolgactie<textarea className={inputClass} rows={2} maxLength={2000} value={invoer.vervolgactie} onChange={e=>change("vervolgactie",e.target.value)}/></label>
    </fieldset>
    {ready && verslag?.status !== "verwerkt" && <div className="mt-3 flex flex-wrap gap-2">
      {verslag?.status !== "verwerken" && <button disabled={busy} onClick={()=>save("concept")} className="rounded-lg border px-3 py-2">Concept bewaren</button>}
      {contactId ? <button disabled={busy} onClick={()=>save("verwerk")} className="rounded-lg bg-primary px-3 py-2 text-white">{verslag?.status === "verwerken" ? "Verwerking opnieuw proberen" : "Afronden voor " + (naam || "gekoppeld contact")}</button> : <p>Kies een Mautic-contact bij deze afspraak om het verslag af te ronden.</p>}
    </div>}
    <p role="status" className="mt-2 text-sm">{melding || (!ready ? "Verslag laden…" : "")}</p>
  </section>;
}
