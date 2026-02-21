"use client";

import { useEffect, useState } from "react";
import {
  VERKOOPMETHODE_LABELS,
} from "@/lib/projectTypes";

interface TypeDefaults {
  courtagePercentage?: string;
  kostenPubliciteit?: number;
  kostenEnergielabel?: number;
  kostenJuridisch?: number;
  kostenBouwkundig?: number;
  kostenIntrekking?: number;
  kostenBedenktijd?: number;
  verkoopmethode?: string;
}

type ProjectType = "VERKOOP" | "AANKOOP" | "TAXATIE";

const TYPE_LABELS: Record<ProjectType, string> = {
  VERKOOP: "Verkoop",
  AANKOOP: "Aankoop",
  TAXATIE: "Taxatie",
};

const KOSTEN_FIELDS: { key: keyof TypeDefaults; label: string }[] = [
  { key: "kostenPubliciteit", label: "Publiciteit" },
  { key: "kostenEnergielabel", label: "Energielabel" },
  { key: "kostenJuridisch", label: "Juridisch" },
  { key: "kostenBouwkundig", label: "Bouwkundig" },
  { key: "kostenIntrekking", label: "Intrekking" },
  { key: "kostenBedenktijd", label: "Bedenktijd" },
];

const MAUTIC_FIELDS = [
  { field: "verkoopgesprek_status", label: "Status gesprek", type: "select", options: ["gepland", "gehad", "followup_verstuurd", "offerte_geaccepteerd"] },
  { field: "segment_prioriteit", label: "Segment prioriteit", type: "select", options: ["a_sweetspot", "b_volledig", "c_recent", "d_oud"] },
  { field: "timing_gesprek", label: "Timing gesprek", type: "select", options: ["zsm", "2weken", "dezemaand", "volgendkwartaal"] },
  { field: "interesse_financiering", label: "Interesse financiering", type: "number (0-100)" },
  { field: "interesse_duurzaamheid", label: "Interesse duurzaamheid", type: "number (0-100)" },
  { field: "interesse_verbouwing", label: "Interesse verbouwing", type: "number (0-100)" },
  { field: "interesse_investeren", label: "Interesse investeren", type: "number (0-100)" },
  { field: "interesse_starters", label: "Interesse starters", type: "number (0-100)" },
  { field: "bezichtiging_interesse", label: "Bezichtiging interesse", type: "number (0-100)" },
  { field: "ai_profiel_data", label: "AI profiel data", type: "JSON (textarea)" },
];

export default function InstellingenPage() {
  const [defaults, setDefaults] = useState<Record<ProjectType, TypeDefaults>>({
    VERKOOP: {},
    AANKOOP: {},
    TAXATIE: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectType>("VERKOOP");

  useEffect(() => {
    fetch("/api/instellingen")
      .then((r) => r.json())
      .then((data) => {
        setDefaults({
          VERKOOP: (data["defaults_VERKOOP"] as TypeDefaults) || {},
          AANKOOP: (data["defaults_AANKOOP"] as TypeDefaults) || {},
          TAXATIE: (data["defaults_TAXATIE"] as TypeDefaults) || {},
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/instellingen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaults_VERKOOP: defaults.VERKOOP,
          defaults_AANKOOP: defaults.AANKOOP,
          defaults_TAXATIE: defaults.TAXATIE,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage("Instellingen opgeslagen");
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        setSaveMessage("Fout bij opslaan");
      }
    } catch {
      setSaveMessage("Netwerkfout");
    }
    setSaving(false);
  }

  function updateDefault(type: ProjectType, key: keyof TypeDefaults, value: string) {
    setDefaults((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [key]: value === "" ? undefined : (key.startsWith("kosten") ? Number(value) : value),
      },
    }));
  }

  const d = defaults[activeTab];

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Instellingen laden...</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Instellingen</h1>
        <p className="mt-1 text-sm text-gray-500">Stel standaard waarden in per projecttype. Deze worden automatisch ingeladen bij het aanmaken van een nieuw project.</p>
      </div>

      {/* Sectie 1: Standaard projectinstellingen */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Standaard projectinstellingen per type</h2>
        </div>

        {/* Type tabs */}
        <div className="flex border-b border-gray-200 px-6 pt-4">
          {(["VERKOOP", "AANKOOP", "TAXATIE"] as ProjectType[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`mr-4 border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Courtage (%)</label>
              <input
                type="text"
                value={d.courtagePercentage || ""}
                onChange={(e) => updateDefault(activeTab, "courtagePercentage", e.target.value)}
                placeholder="bijv. 1.2"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            {activeTab === "VERKOOP" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Standaard verkoopmethode</label>
                <select
                  value={d.verkoopmethode || ""}
                  onChange={(e) => updateDefault(activeTab, "verkoopmethode", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Geen standaard</option>
                  {Object.entries(VERKOOPMETHODE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Standaard kosten (€)</p>
            <div className="grid grid-cols-3 gap-3">
              {KOSTEN_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
                  <input
                    type="number"
                    value={d[key] != null ? String(d[key]) : ""}
                    onChange={(e) => updateDefault(activeTab, key, e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              ))}
            </div>
            {/* Totaal kosten */}
            {KOSTEN_FIELDS.some(({ key }) => d[key] != null) && (
              <div className="mt-2 flex justify-end rounded-lg bg-gray-50 px-4 py-2 text-sm">
                <span className="text-gray-500">Totaal kosten:</span>
                <span className="ml-2 font-semibold text-gray-900">
                  € {KOSTEN_FIELDS
                    .map(({ key }) => Number(d[key] || 0))
                    .reduce((a, b) => a + b, 0)
                    .toLocaleString("nl-NL")}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            {saveMessage && (
              <p className={`text-sm ${saveMessage.includes("Fout") || saveMessage.includes("fout") ? "text-red-600" : "text-green-600"}`}>
                {saveMessage}
              </p>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                {saving ? "Opslaan..." : "Instellingen opslaan"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Sectie 2: Mautic velden referentie */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Mautic velden — referentie</h2>
          <p className="mt-1 text-sm text-gray-500">
            Deze Mautic velden worden gebruikt voor de pipeline en kunnen via Mautic of n8n workflows worden bijgewerkt.
          </p>
        </div>
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Veld</th>
                <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Label</th>
                <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type / Opties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MAUTIC_FIELDS.map((f) => (
                <tr key={f.field}>
                  <td className="py-2 font-mono text-xs text-gray-600">{f.field}</td>
                  <td className="py-2 text-gray-700">{f.label}</td>
                  <td className="py-2 text-gray-500">
                    {"options" in f ? (
                      <span className="italic">{f.options.join(", ")}</span>
                    ) : (
                      f.type
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
