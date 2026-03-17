"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { WoningRecord } from "../actions";

const BRACKETS = [
  { lo: 0, hi: 200000, label: "< €200k" },
  { lo: 200000, hi: 250000, label: "€200-250k" },
  { lo: 250000, hi: 300000, label: "€250-300k" },
  { lo: 300000, hi: 350000, label: "€300-350k" },
  { lo: 350000, hi: 400000, label: "€350-400k" },
  { lo: 400000, hi: 999999999, label: "> €400k" },
];

interface Props {
  records: WoningRecord[];
  budget: number;
}

export default function PrijsklasseChart({ records, budget }: Props) {
  const data = BRACKETS.map((b) => ({
    label: b.label,
    aantal: records.filter((r) => r.prijs >= b.lo && r.prijs < b.hi).length,
    binnenBudget: b.hi <= budget || (b.lo < budget && budget < b.hi),
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        Verdeling per prijsklasse
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value) => [`${value} woningen`, "Aantal"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="aantal" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.binnenBudget ? "#378ADD" : "#D3D1C7"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#378ADD]" />
          Binnen budget
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#D3D1C7]" />
          Boven budget
        </span>
      </div>
    </div>
  );
}
