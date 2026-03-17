"use client";

import { useState } from "react";
import type { WoningRecord } from "../actions";

const STATUS_STYLES: Record<string, string> = {
  Beschikbaar: "bg-green-100 text-green-800",
  "Onder bod": "bg-blue-100 text-blue-800",
  "Verkocht onder voorbehoud": "bg-yellow-100 text-yellow-800",
  Verkocht: "bg-red-100 text-red-800",
};

interface Props {
  records: WoningRecord[];
}

export default function ResultatenTabel({ records }: Props) {
  const [visibleCount, setVisibleCount] = useState(50);

  const sorted = [...records].sort((a, b) => a.prijs - b.prijs);
  const visible = sorted.slice(0, visibleCount);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Resultaten ({records.length} woningen)
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium text-gray-500">
              <th className="px-4 py-2">Adres</th>
              <th className="px-4 py-2">Plaats</th>
              <th className="px-4 py-2 text-right">Prijs</th>
              <th className="px-4 py-2 text-right">m²</th>
              <th className="px-4 py-2 text-right">€/m²</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Kamers</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={i}
                className="border-b border-gray-50 transition-colors hover:bg-gray-50"
              >
                <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                  {r.adres}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.plaats}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-gray-900">
                  €{r.prijs.toLocaleString("nl-NL")}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {r.m2 ?? "–"}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {r.prijs_m2 ? `€${Math.round(r.prijs_m2).toLocaleString("nl-NL")}` : "–"}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {r.soort_og}
                  {r.type ? ` · ${r.type}` : ""}
                </td>
                <td className="px-4 py-2">
                  {r.label ? (
                    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: getLabelBg(r.label), color: getLabelColor(r.label) }}>
                      {r.label}
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {r.kamers ?? "–"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] || "bg-gray-100 text-gray-600"}`}
                  >
                    {r.status || "Onbekend"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleCount < records.length && (
        <div className="border-t border-gray-100 px-4 py-3 text-center">
          <button
            onClick={() => setVisibleCount((c) => c + 50)}
            className="text-sm font-medium text-primary hover:text-primary-dark"
          >
            Toon meer ({records.length - visibleCount} resterend)
          </button>
        </div>
      )}
    </div>
  );
}

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

function getLabelBg(label: string): string {
  const base = label.replace(/[^A-G]/g, "");
  const map: Record<string, string> = {
    A: "#dcfce7",
    B: "#dbeafe",
    C: "#ecfccb",
    D: "#fef3c7",
    E: "#fee2e2",
    F: "#fee2e2",
    G: "#f3f4f6",
  };
  return map[base] ?? "#f3f4f6";
}
