"use client";
import { useEffect, useState } from "react";
import type { QuestionList } from "@/lib/vragenlijst";
import type { ZakenList } from "@/lib/lijstVanZaken";

type Source = ZakenList & { capturedAt: string | null; receivedAt: string; origin: string | null };
export function LijstVanZaken({ projectId }: { projectId: string }) {
  const [data, setData] = useState<{ list: Source | null; questions: (QuestionList & { receivedAt: string; origin: string | null }) | null } | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projecten/${projectId}/lijst-van-zaken`, { signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error("Lijst van zaken kon niet worden geladen"); return r.json(); })
      .then(d => { setData(d); setError(""); })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [projectId, revision]);
  const list = data?.list;
  const questions = data?.questions;
  return <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-900">Bijzonderheden uit de lijst van zaken</h2><button type="button" className="text-sm text-primary underline" onClick={() => setRevision(r => r + 1)}>Vernieuwen</button></div>
    {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : !data ? <p className="mt-3 text-sm">Laden…</p> : !list ? <p className="mt-3 text-sm text-gray-600">Nog niet ontvangen. Sla de lijst van zaken in Realworks op met de bijgewerkte extensie.</p> : <>
      <p className="mt-2 text-xs text-gray-500">{list.origin === "user_supplied_form" ? "Aangeleverde Realworks-formuliergegevens" : "Realworks-extensie"} · object {list.objectcode} · lijst {list.systemid} · ontvangen {new Date(list.receivedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</p>
      <p className="mt-2 text-sm text-gray-600">Dit zijn de ingevulde antwoorden. Controleer de actuele lijst bij twijfel. </p>
      <ul className="mt-4 space-y-2 text-sm">{list.items.filter(i => i.attention).map(i => <li key={i.field}><strong className="capitalize">{i.label}</strong>: {i.answer}</li>)}</ul>
      {!list.items.some(i => i.attention) && <p className="mt-3 text-sm">Geen afwijkingen geselecteerd voor dit overzicht.</p>}
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Alle antwoorden ({list.items.length})</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Onderdeel</th><th className="p-2">Antwoord</th></tr></thead><tbody>{list.items.map(i => <tr key={i.field} className="border-t"><td className="p-2 capitalize">{i.label}</td><td className="p-2">{i.answer}</td></tr>)}</tbody></table></div></details>
    </>}
    <div className="mt-6 border-t pt-5"><h2 className="font-semibold text-gray-900">Aandachtspunten uit de vragenlijst</h2>
      {!questions ? <p className="mt-2 text-sm text-gray-600">Nog niet ontvangen.</p> : <>
        <p className="mt-2 text-xs text-gray-500">{questions.origin === "user_supplied_form" ? "Aangeleverde Realworks-formuliergegevens" : "Realworks-extensie"} · vragenlijst {questions.systemid} · versie {questions.version} · ontvangen {new Date(questions.receivedAt).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}</p>
        <p className="mt-2 text-sm text-gray-600">Verklaringen van de verkoper; geen vastgestelde technische conclusies. Deel A met persoonlijke verkopersgegevens is niet opgenomen.</p>
        {!questions.labelsComplete && <p className="mt-2 text-sm text-amber-700">Niet alle vraagteksten zijn gekoppeld. Controleer de oorspronkelijke vragenlijst.</p>}
        <p className="mt-2 text-xs text-gray-500">Alleen concrete bijzonderheden en toelichtingen. Niet van toepassing en onbekende antwoorden staan bij de volledige antwoorden.</p>
        <dl className="mt-4 divide-y divide-gray-100">{questions.highlights.map(g => <div key={g.number} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]"><dt className="text-sm font-medium">{g.title} <span className="font-normal text-gray-400">({g.number})</span></dt><dd className="space-y-1 text-sm text-gray-700">{g.details.map((detail, index) => <p key={index}>{detail}</p>)}</dd></div>)}</dl>
        {!questions.highlights.length && <p className="mt-3 text-sm">Geen aandachtspunten geselecteerd. Bekijk de volledige antwoorden.</p>}
        <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Alle woningvragen en antwoorden ({questions.items.length})</summary><div className="mt-3 space-y-3">{questions.items.map(i => <div key={i.field} className="border-t pt-2 text-sm"><strong>{i.number} {i.question}</strong><p>{i.label !== i.question ? i.label + " " : ""}{i.answer}</p></div>)}</div></details>
      </>}
    </div>
  </section>;
}
