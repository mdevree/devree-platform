"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
export default function EnergyLabelHealth() {
  const [health,setHealth]=useState<{status:string;throughDate?:string;lastSuccessAt?:string;error?:string;pendingAddresses?:number}|null>(null);
  useEffect(()=>{fetch("/api/system/health/energy-labels").then(r=>{if(!r.ok)throw new Error();return r.json();}).then(setHealth).catch(()=>setHealth({status:"failed",error:"Status niet beschikbaar"}));},[]);
  return <section className="rounded-xl border border-gray-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Energielabelmonitor</h2><Link className="text-sm text-blue-700 underline" href="/kansen/vroege-signalen">Vroege signalen</Link></div><p className="mt-2 text-sm">Status: {health?.status==="ok"?"Bijgewerkt":health?"Aandacht":"Laden…"} · Bron verwerkt t/m {health?.throughDate||"—"} · Adrescontrole nodig: {health?.pendingAddresses??"—"}</p>{health?.error && <p className="mt-2 text-sm text-amber-700">{health.error}</p>}</section>;
}
