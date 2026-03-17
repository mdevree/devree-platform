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

const LABEL_ORDER = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

const LABEL_COLORS: Record<string, string> = {
  A: "#1D9E75",
  B: "#378ADD",
  C: "#639922",
  D: "#BA7517",
  E: "#D85A30",
  F: "#A32D2D",
  G: "#2C2C2A",
};

function getLabelColor(label: string): string {
  const base = label.replace(/[^A-G]/g, "");
  return LABEL_COLORS[base] ?? "#888780";
}

interface Props {
  records: WoningRecord[];
}

export default function LabelChart({ records }: Props) {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.label) {
      counts.set(r.label, (counts.get(r.label) || 0) + 1);
    }
  }

  const data = LABEL_ORDER.filter((l) => counts.has(l)).map((l) => ({
    label: l,
    aantal: counts.get(l)!,
  }));

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        Energielabels binnen selectie
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
              <Cell key={i} fill={getLabelColor(entry.label)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
