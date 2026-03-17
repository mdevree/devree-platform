"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
}

export default function SoortChart({ records }: Props) {
  const data = BRACKETS.map((b) => {
    const inBracket = records.filter((r) => r.prijs >= b.lo && r.prijs < b.hi);
    return {
      label: b.label,
      Woonhuis: inBracket.filter((r) => r.soort_og === "Woonhuis").length,
      Appartement: inBracket.filter((r) => r.soort_og === "Appartement").length,
    };
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        Woonhuis vs. appartement per prijsklasse
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="Woonhuis"
            stackId="a"
            fill="#378ADD"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="Appartement"
            stackId="a"
            fill="#60A5FA"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
