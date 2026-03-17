"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { WoningRecord } from "../actions";

interface Props {
  records: WoningRecord[];
}

export default function PrijsInzicht({ records }: Props) {
  const stats = useMemo(() => {
    const metTransactie = records.filter(
      (r) => r.trans_prijs && r.trans_prijs > 0
    );

    if (metTransactie.length === 0) return null;

    const verschillen = metTransactie.map((r) => ({
      verschil: r.trans_prijs! - r.prijs,
      percentage: ((r.trans_prijs! - r.prijs) / r.prijs) * 100,
      adres: r.adres,
      plaats: r.plaats,
      vraagprijs: r.prijs,
      transactieprijs: r.trans_prijs!,
    }));

    const gemVraagprijs =
      metTransactie.reduce((s, r) => s + r.prijs, 0) / metTransactie.length;
    const gemTransactie =
      metTransactie.reduce((s, r) => s + r.trans_prijs!, 0) /
      metTransactie.length;
    const gemVerschilPerc =
      verschillen.reduce((s, v) => s + v.percentage, 0) / verschillen.length;

    const overboden = verschillen.filter((v) => v.verschil > 0).length;
    const onderboden = verschillen.filter((v) => v.verschil < 0).length;
    const opVraagprijs = verschillen.filter((v) => v.verschil === 0).length;

    // Verdeling per bracket
    const brackets = [
      { lo: -Infinity, hi: -5, label: "< -5%" },
      { lo: -5, hi: -2, label: "-5% tot -2%" },
      { lo: -2, hi: 0, label: "-2% tot 0%" },
      { lo: 0, hi: 0.001, label: "Op vraagprijs" },
      { lo: 0.001, hi: 2, label: "0% tot +2%" },
      { lo: 2, hi: 5, label: "+2% tot +5%" },
      { lo: 5, hi: 10, label: "+5% tot +10%" },
      { lo: 10, hi: Infinity, label: "> +10%" },
    ];

    const verdelingData = brackets
      .map((b) => {
        const count = verschillen.filter((v) => {
          if (b.lo === 0 && b.hi === 0.001) return v.percentage === 0;
          if (b.lo === 0.001) return v.percentage > 0 && v.percentage <= b.hi;
          return v.percentage > b.lo && v.percentage <= b.hi;
        }).length;
        return { name: b.label, aantal: count };
      })
      .filter((d) => d.aantal > 0);

    return {
      aantal: metTransactie.length,
      gemVraagprijs: Math.round(gemVraagprijs),
      gemTransactie: Math.round(gemTransactie),
      gemVerschilPerc: gemVerschilPerc,
      gemVerschilAbs: Math.round(gemTransactie - gemVraagprijs),
      overboden,
      onderboden,
      opVraagprijs,
      verdelingData,
    };
  }, [records]);

  if (!stats) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Prijsinzicht: vraagprijs vs. transactieprijs
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Geen transactieprijzen beschikbaar in de huidige selectie.
        </p>
      </div>
    );
  }

  const isOverboden = stats.gemVerschilPerc > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        Prijsinzicht: vraagprijs vs. transactieprijs
      </h3>

      {/* Key metrics */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500">
            Gem. vraagprijs
          </p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            €{stats.gemVraagprijs.toLocaleString("nl-NL")}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500">
            Gem. transactieprijs
          </p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            €{stats.gemTransactie.toLocaleString("nl-NL")}
          </p>
        </div>
        <div
          className={`rounded-lg p-3 ${
            isOverboden ? "bg-red-50" : "bg-green-50"
          }`}
        >
          <p className="text-xs font-medium text-gray-500">
            Gem. verschil
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              isOverboden ? "text-red-700" : "text-green-700"
            }`}
          >
            {stats.gemVerschilPerc >= 0 ? "+" : ""}
            {stats.gemVerschilPerc.toFixed(1)}%
            <span className="ml-1 text-sm font-normal">
              ({stats.gemVerschilAbs >= 0 ? "+" : ""}€
              {Math.abs(stats.gemVerschilAbs).toLocaleString("nl-NL")})
            </span>
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500">Verdeling</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-red-600">
              {stats.overboden}x overboden
            </span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-sm font-semibold text-green-600">
              {stats.onderboden}x onder
            </span>
            {stats.opVraagprijs > 0 && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-sm font-semibold text-gray-600">
                  {stats.opVraagprijs}x gelijk
                </span>
              </>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            {stats.aantal} transacties
          </p>
        </div>
      </div>

      {/* Verdeling chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={stats.verdelingData}
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "12px",
              }}
              formatter={(value) => [`${value} woningen`, "Aantal"]}
            />
            <ReferenceLine x="Op vraagprijs" stroke="#9ca3af" strokeDasharray="3 3" />
            <Bar
              dataKey="aantal"
              radius={[4, 4, 0, 0]}
              fill="#378ADD"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Gebaseerd op {stats.aantal} woningen met bekende transactieprijs in de
        huidige selectie.
      </p>
    </div>
  );
}
