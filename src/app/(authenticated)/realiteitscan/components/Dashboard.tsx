"use client";

import { useState, useMemo } from "react";
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  HomeIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";
import type { WoningRecord } from "../actions";
import PrijsklasseChart from "./PrijsklasseChart";
import SoortChart from "./SoortChart";
import LabelChart from "./LabelChart";
import ConcessiesBlok from "./ConcessiesBlok";
import PrijsInzicht from "./PrijsInzicht";
import ResultatenTabel from "./ResultatenTabel";

interface Props {
  records: WoningRecord[];
  fileName: string;
  onReset: () => void;
}

export default function Dashboard({ records, fileName, onReset }: Props) {
  const maxPrijs = useMemo(
    () => Math.max(...records.map((r) => r.prijs)),
    [records]
  );

  const [budget, setBudget] = useState(() =>
    Math.min(300000, Math.ceil(maxPrijs / 25000) * 25000)
  );
  const [soort, setSoort] = useState<"all" | "Woonhuis" | "Appartement">("all");
  const [stad, setStad] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "actief" | "Verkocht">("all");
  const [labelFilter, setLabelFilter] = useState<"all" | "ABC" | "DEF" | "A">(
    "all"
  );
  const [minKamers, setMinKamers] = useState<number>(0);
  const [minM2, setMinM2] = useState<number>(0);
  const [minPerceel, setMinPerceel] = useState<number>(0);

  const plaatsen = useMemo(
    () => [...new Set(records.map((r) => r.plaats))].sort(),
    [records]
  );

  const maxKamers = useMemo(
    () => Math.max(...records.filter((r) => r.kamers).map((r) => r.kamers!), 0),
    [records]
  );
  const maxM2 = useMemo(
    () => Math.max(...records.filter((r) => r.m2).map((r) => r.m2!), 0),
    [records]
  );
  const maxPerceel = useMemo(
    () => Math.max(...records.filter((r) => r.perceel).map((r) => r.perceel!), 0),
    [records]
  );

  const gefilterd = useMemo(() => {
    return records.filter((r) => {
      if (r.prijs > budget) return false;
      if (soort !== "all" && r.soort_og !== soort) return false;
      if (stad !== "all" && r.plaats !== stad) return false;
      if (
        status === "actief" &&
        !["Beschikbaar", "Onder bod"].includes(r.status)
      )
        return false;
      if (
        status === "Verkocht" &&
        !["Verkocht", "Verkocht onder voorbehoud"].includes(r.status)
      )
        return false;
      if (
        labelFilter === "ABC" &&
        !["A", "A+", "A++", "A+++", "B", "C"].includes(r.label)
      )
        return false;
      if (
        labelFilter === "DEF" &&
        !["D", "E", "F", "G"].includes(r.label)
      )
        return false;
      if (labelFilter === "A" && !r.label.startsWith("A")) return false;
      if (minKamers > 0 && (!r.kamers || r.kamers < minKamers)) return false;
      if (minM2 > 0 && (!r.m2 || r.m2 < minM2)) return false;
      if (minPerceel > 0 && (!r.perceel || r.perceel < minPerceel)) return false;
      return true;
    });
  }, [records, budget, soort, stad, status, labelFilter, minKamers, minM2, minPerceel]);

  const woonhuizen = gefilterd.filter((r) => r.soort_og === "Woonhuis").length;
  const appartementen = gefilterd.filter(
    (r) => r.soort_og === "Appartement"
  ).length;

  const gemM2 = useMemo(() => {
    const metM2 = gefilterd.filter((r) => r.m2);
    if (metM2.length === 0) return null;
    return Math.round(metM2.reduce((s, r) => s + r.m2!, 0) / metM2.length);
  }, [gefilterd]);

  const gemPrijs = useMemo(() => {
    if (gefilterd.length === 0) return null;
    return Math.round(
      gefilterd.reduce((s, r) => s + r.prijs, 0) / gefilterd.length
    );
  }, [gefilterd]);

  const gemTransactie = useMemo(() => {
    const metTrans = gefilterd.filter((r) => r.trans_prijs && r.trans_prijs > 0);
    if (metTrans.length === 0) return null;
    return Math.round(
      metTrans.reduce((s, r) => s + r.trans_prijs!, 0) / metTrans.length
    );
  }, [gefilterd]);

  const gemVerschilPerc = useMemo(() => {
    const metTrans = gefilterd.filter((r) => r.trans_prijs && r.trans_prijs > 0);
    if (metTrans.length === 0) return null;
    const percs = metTrans.map((r) => ((r.trans_prijs! - r.prijs) / r.prijs) * 100);
    return percs.reduce((s, p) => s + p, 0) / percs.length;
  }, [gefilterd]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {fileName} &middot; {records.length} woningen geladen
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Nieuw bestand
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <AdjustmentsHorizontalIcon className="h-5 w-5" />
          Filters
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Budget slider */}
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Maximaal budget
            </label>
            <input
              type="range"
              min={50000}
              max={Math.ceil(maxPrijs / 25000) * 25000}
              step={25000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>€50k</span>
              <span className="font-semibold text-primary">
                €{budget.toLocaleString("nl-NL")}
              </span>
              <span>€{(Math.ceil(maxPrijs / 25000) * 25000 / 1000).toFixed(0)}k</span>
            </div>
          </div>

          {/* Soort */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Soort object
            </label>
            <select
              value={soort}
              onChange={(e) => setSoort(e.target.value as typeof soort)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="all">Alle types</option>
              <option value="Woonhuis">Woonhuis</option>
              <option value="Appartement">Appartement</option>
            </select>
          </div>

          {/* Stad */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Plaats
            </label>
            <select
              value={stad}
              onChange={(e) => setStad(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="all">Alle plaatsen</option>
              {plaatsen.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="all">Alle statussen</option>
              <option value="actief">Actief (beschikbaar + onder bod)</option>
              <option value="Verkocht">Verkocht</option>
            </select>
          </div>
        </div>

        {/* Extra filters: kamers, m², perceel */}
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {/* Min. kamers */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Min. kamers
            </label>
            <input
              type="range"
              min={0}
              max={maxKamers}
              step={1}
              value={minKamers}
              onChange={(e) => setMinKamers(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>Alle</span>
              <span className="font-semibold text-primary">
                {minKamers === 0 ? "Geen minimum" : `${minKamers}+ kamers`}
              </span>
              <span>{maxKamers}</span>
            </div>
          </div>

          {/* Min. woonoppervlakte */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Min. woonoppervlakte
            </label>
            <input
              type="range"
              min={0}
              max={Math.ceil(maxM2 / 10) * 10}
              step={10}
              value={minM2}
              onChange={(e) => setMinM2(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>Alle</span>
              <span className="font-semibold text-primary">
                {minM2 === 0 ? "Geen minimum" : `${minM2}+ m²`}
              </span>
              <span>{Math.ceil(maxM2 / 10) * 10} m²</span>
            </div>
          </div>

          {/* Min. perceeloppervlakte */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Min. perceeloppervlakte
            </label>
            <input
              type="range"
              min={0}
              max={Math.ceil(maxPerceel / 25) * 25}
              step={25}
              value={minPerceel}
              onChange={(e) => setMinPerceel(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>Alle</span>
              <span className="font-semibold text-primary">
                {minPerceel === 0 ? "Geen minimum" : `${minPerceel}+ m²`}
              </span>
              <span>{Math.ceil(maxPerceel / 25) * 25} m²</span>
            </div>
          </div>
        </div>

        {/* Energielabel filter */}
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Energielabel
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Alle labels"],
                ["A", "Alleen A+"],
                ["ABC", "A t/m C"],
                ["DEF", "D t/m G"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setLabelFilter(value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  labelFilter === value
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Matches"
          value={gefilterd.length.toString()}
          sub={`van ${records.length} totaal`}
        />
        <MetricCard
          label="Woonhuizen"
          value={woonhuizen.toString()}
          sub={`${appartementen} appartementen`}
          icon={<HomeIcon className="h-5 w-5 text-blue-500" />}
        />
        <MetricCard
          label="Gem. woonoppervlakte"
          value={gemM2 ? `${gemM2} m²` : "–"}
          icon={<BuildingOfficeIcon className="h-5 w-5 text-green-500" />}
        />
        <MetricCard
          label="Gem. vraagprijs"
          value={gemPrijs ? `€${gemPrijs.toLocaleString("nl-NL")}` : "–"}
        />
        <MetricCard
          label="Gem. transactieprijs"
          value={gemTransactie ? `€${gemTransactie.toLocaleString("nl-NL")}` : "–"}
          sub={gemTransactie ? `${gefilterd.filter((r) => r.trans_prijs && r.trans_prijs > 0).length} transacties` : "geen data"}
        />
        <MetricCard
          label="Gem. over/onderbod"
          value={
            gemVerschilPerc !== null
              ? `${gemVerschilPerc >= 0 ? "+" : ""}${gemVerschilPerc.toFixed(1)}%`
              : "–"
          }
          sub={
            gemVerschilPerc !== null
              ? gemVerschilPerc >= 0
                ? "boven vraagprijs"
                : "onder vraagprijs"
              : undefined
          }
          highlight={gemVerschilPerc !== null ? (gemVerschilPerc >= 0 ? "red" : "green") : undefined}
        />
      </div>

      {/* Concessies */}
      <ConcessiesBlok
        records={records}
        gefilterd={gefilterd}
        budget={budget}
        soort={soort}
        stad={stad}
      />

      {/* Prijsinzicht */}
      <PrijsInzicht records={gefilterd} />

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PrijsklasseChart records={records} budget={budget} />
        <SoortChart records={gefilterd} />
      </div>
      <LabelChart records={gefilterd} />

      {/* Tabel */}
      <ResultatenTabel records={gefilterd} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: "red" | "green";
}) {
  const highlightClass = highlight === "red"
    ? "text-red-600"
    : highlight === "green"
      ? "text-green-600"
      : "text-gray-900";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {icon}
      </div>
      <p className={`mt-1 text-2xl font-bold ${highlightClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
