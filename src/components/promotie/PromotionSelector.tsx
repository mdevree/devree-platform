"use client";
import { useState } from "react";
import { FUNDA, PHOTOGRAPHY, PHOTO_FEATURES, calculatePromotion, money, promotionLines, type Promotion } from "@/lib/promotion";

export function PromotionSummary({ value }: { value: Promotion }) {
  return <div className="space-y-3 text-sm"><dl className="space-y-2">{promotionLines(value).slice(0, 3).map(([label, amount]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="shrink-0 font-semibold">{amount}</dd></div>)}</dl><p className="text-xs text-gray-500">Alle bedragen inclusief btw.</p><p className="text-xs leading-5 text-gray-600">{value.rates.footnote}</p></div>;
}
export default function PromotionSelector({ value, onChange }: { value: Promotion; onChange: (value: Promotion) => void }) {
  const [notice, setNotice] = useState("");
  const card = (selected: boolean) => `flex flex-col items-start rounded-lg border p-4 text-left disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-emerald-700 bg-emerald-50" : "border-gray-200 bg-white"}`;
  return <section className="space-y-5">
    <div><h3 className="font-semibold">Funda-pakket</h3><p className="mt-1 text-xs text-gray-500">Looptijd 1 jaar · inclusief btw</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(FUNDA).map(([key, label]) => <button type="button" key={key} aria-pressed={value.funda === key} className={card(value.funda === key)} onClick={() => {
      const upgrade = key !== "BRONS" && value.photography === "BASIS";
      onChange(calculatePromotion(value.rates, key, upgrade ? "COMPLEET" : value.photography));
      setNotice(upgrade ? "Fotografie is aangepast naar Compleet, omdat Basis niet beschikbaar is bij Funda Zilver en Goud." : "");
    }}><span className="block font-semibold">{label}</span><span className="mt-2 block">{money(value.rates.funda[key as keyof typeof FUNDA])}</span></button>)}</div></div>
    <div><h3 className="font-semibold">Fotografiepakket*</h3><div className="mt-3 grid gap-3 sm:grid-cols-3">{Object.entries(PHOTOGRAPHY).map(([key, label]) => <button type="button" key={key} aria-pressed={value.photography === key} disabled={key === "BASIS" && value.funda !== "BRONS"} className={card(value.photography === key)} onClick={() => { onChange(calculatePromotion(value.rates, value.funda, key)); setNotice(""); }}><span className="block font-semibold">{label}</span><span className="mt-2 block">{money(value.rates.photography[key as keyof typeof PHOTOGRAPHY])}</span><span className="mt-3 block text-xs leading-5">{PHOTO_FEATURES[key as keyof typeof PHOTOGRAPHY].join(" · ")}</span>{key === "BASIS" && value.funda !== "BRONS" && <span className="mt-2 block text-xs">Alleen bij Funda Brons</span>}</button>)}</div></div>
    <p role="status" className="text-sm text-emerald-800">{notice}</p>
    <div aria-live="polite" className="rounded-lg bg-gray-50 p-4"><PromotionSummary value={value} /></div>
  </section>;
}
