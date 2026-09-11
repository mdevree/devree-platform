"use client";
import { useState } from "react";
import PromotionSelector, { PromotionSummary } from "./PromotionSelector";
import { newPromotion, readPromotion, type Promotion } from "@/lib/promotion";
export default function ProjectPromotion({ projectId, value, onSaved }: { projectId: string; value: unknown; onSaved: (p: Promotion) => void }) {
  const saved = readPromotion(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => saved ?? newPromotion());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <section className="rounded-xl border border-gray-200 bg-white p-5"><h3 className="mb-3 font-semibold">Promotiepakketten</h3>
    {editing ? <><PromotionSelector value={draft} onChange={setDraft} /><div className="mt-4 flex gap-3"><button type="button" disabled={busy} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm text-white" onClick={async () => {
      setBusy(true); setError("");
      try {
        const res = await fetch(`/api/projecten/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ promotionChoice: { funda: draft.funda, photography: draft.photography } }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Opslaan mislukt");
        const stored = readPromotion(data.project.promotion);
        if (!stored) throw new Error("Pakketkeuze ontbreekt na opslaan");
        onSaved(stored); setEditing(false);
      } catch (e) { setError(e instanceof Error ? e.message : "Opslaan mislukt"); } finally { setBusy(false); }
    }}>{busy ? "Opslaan..." : "Pakketten opslaan"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Annuleren</button></div></> : <>
      {saved ? <PromotionSummary value={saved} /> : <p className="text-sm text-gray-600">Nieuwe verkoopvoorstellen starten met Funda Zilver en fotografie Compleet (€ 874,00 inclusief btw). Bestaande voorstellen behouden hun afgesproken bedrag.</p>}
      <button type="button" className="mt-3 text-sm font-semibold text-emerald-800" onClick={() => { setDraft(newPromotion(value)); setEditing(true); }}>Voorgestelde pakketten aanpassen</button>
    </>}
    <p className="mt-3 text-xs text-gray-500">Een wijziging geldt voor een nieuw voorstel. Eerder uitgegeven voorstellen behouden hun tarieven en keuzes.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>;
}
