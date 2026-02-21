"use client";

import { useEffect, useState } from "react";
import { VERKOOPMETHODE_LABELS } from "@/lib/projectTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerkooopDefaults {
  courtagePercentage?: string;
  verkoopmethode?: string;
  kostenPubliciteit?: number;
  kostenEnergielabel?: number;
  kostenJuridisch?: number;
  kostenBouwkundig?: number;
  kostenIntrekking?: number;
  kostenBedenktijd?: number;
}

interface AankoopDefaults {
  tariefVast?: number;               // vast tarief voor aankoop begeleiding
  bezichtigingenInbegrepen?: number; // aantal bezichtigingen inbegrepen in vast tarief
  tariefPerExtraBezichtiging?: number; // bedrag per extra bezichtiging daarboven
}

interface TaxatieDefaults {
  tariefVast?: number;   // vast taxatietarief
  kostenNwwi?: number;   // NWWI registerkosten
}

type ProjectType = "VERKOOP" | "AANKOOP" | "TAXATIE";

interface AllDefaults {
  VERKOOP: VerkooopDefaults;
  AANKOOP: AankoopDefaults;
  TAXATIE: TaxatieDefaults;
}

// ─── Constanten ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ProjectType, string> = {
  VERKOOP: "Verkoop",
  AANKOOP: "Aankoop",
  TAXATIE: "Taxatie",
};

const VERKOOP_KOSTEN_FIELDS: { key: keyof VerkooopDefaults; label: string }[] = [
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function numVal(v: number | undefined): string {
  return v != null ? String(v) : "";
}

function toNum(v: string): number | undefined {
  return v === "" ? undefined : Number(v);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InstellingenPage() {
  const [defaults, setDefaults] = useState<AllDefaults>({
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
          VERKOOP: (data["defaults_VERKOOP"] as VerkooopDefaults) || {},
          AANKOOP: (data["defaults_AANKOOP"] as AankoopDefaults) || {},
          TAXATIE: (data["defaults_TAXATIE"] as TaxatieDefaults) || {},
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

  function updateVerkoop(key: keyof VerkooopDefaults, value: string) {
    setDefaults((prev) => ({
      ...prev,
      VERKOOP: {
        ...prev.VERKOOP,
        [key]: value === "" ? undefined : (key.startsWith("kosten") ? Number(value) : value),
      },
    }));
  }

  function updateAankoop(key: keyof AankoopDefaults, value: string) {
    setDefaults((prev) => ({
      ...prev,
      AANKOOP: { ...prev.AANKOOP, [key]: toNum(value) },
    }));
  }

  function updateTaxatie(key: keyof TaxatieDefaults, value: string) {
    setDefaults((prev) => ({
      ...prev,
      TAXATIE: { ...prev.TAXATIE, [key]: toNum(value) },
    }));
  }

  const v = defaults.VERKOOP;
  const a = defaults.AANKOOP;
  const t = defaults.TAXATIE;

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Instellingen laden...</div>;
  }

  // Totaal vaste kosten VERKOOP
  const verkooTotaalKosten = VERKOOP_KOSTEN_FIELDS
    .map(({ key }) => Number(v[key] || 0))
    .reduce((acc, n) => acc + n, 0);

  // Totaal taxatie
  const taxatieTotaal = Number(t.tariefVast || 0) + Number(t.kostenNwwi || 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Instellingen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Stel standaard tarieven en kosten in per projecttype. Deze worden automatisch ingeladen bij het aanmaken van een nieuw project.
        </p>
      </div>

      {/* Sectie 1: Standaard projectinstellingen */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Standaard tarieven per type</h2>
        </div>

        {/* Type tabs */}
        <div className="flex border-b border-gray-200 px-6 pt-4">
          {(["VERKOOP", "AANKOOP", "TAXATIE"] as ProjectType[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`mr-4 border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {TYPE_LABELS[tab]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-6">

          {/* ── VERKOOP ── */}
          {activeTab === "VERKOOP" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Courtage (%)</label>
                  <input
                    type="text"
                    value={v.courtagePercentage || ""}
                    onChange={(e) => updateVerkoop("courtagePercentage", e.target.value)}
                    placeholder="bijv. 1.2"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Standaard verkoopmethode</label>
                  <select
                    value={v.verkoopmethode || ""}
                    onChange={(e) => updateVerkoop("verkoopmethode", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">Geen standaard</option>
                    {Object.entries(VERKOOPMETHODE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Standaard bijkomende kosten (€)</p>
                <div className="grid grid-cols-3 gap-3">
                  {VERKOOP_KOSTEN_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
                      <input
                        type="number"
                        value={v[key] != null ? String(v[key]) : ""}
                        onChange={(e) => updateVerkoop(key, e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                {verkooTotaalKosten > 0 && (
                  <div className="mt-2 flex justify-end rounded-lg bg-gray-50 px-4 py-2 text-sm">
                    <span className="text-gray-500">Totaal kosten:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      € {verkooTotaalKosten.toLocaleString("nl-NL")}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── AANKOOP ── */}
          {activeTab === "AANKOOP" && (
            <>
              <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Aankoop begeleiding werkt met een vast tarief inclusief een aantal bezichtigingen. Daarboven rekent u een extra bedrag per bezichtiging.
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vast tarief (€)</label>
                  <input
                    type="number"
                    value={numVal(a.tariefVast)}
                    onChange={(e) => updateAankoop("tariefVast", e.target.value)}
                    placeholder="bijv. 3500"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">All-in tarief inclusief begeleiding en een aantal bezichtigingen</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">Extra bezichtigingen</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Inbegrepen bezichtigingen</label>
                    <input
                      type="number"
                      value={numVal(a.bezichtigingenInbegrepen)}
                      onChange={(e) => updateAankoop("bezichtigingenInbegrepen", e.target.value)}
                      placeholder="bijv. 3"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-400">Aantal bezichtigingen inbegrepen in vast tarief</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Extra bedrag per bezichtiging (€)</label>
                    <input
                      type="number"
                      value={numVal(a.tariefPerExtraBezichtiging)}
                      onChange={(e) => updateAankoop("tariefPerExtraBezichtiging", e.target.value)}
                      placeholder="bijv. 250"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-gray-400">Bedrag per bezichtiging boven het inbegrepen aantal</p>
                  </div>
                </div>

                {/* Voorbeeld berekening */}
                {a.tariefVast && a.bezichtigingenInbegrepen && a.tariefPerExtraBezichtiging && (
                  <div className="mt-3 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-600">
                    <p className="font-medium text-gray-700 mb-1">Voorbeeld berekening</p>
                    <p>Vast tarief: € {Number(a.tariefVast).toLocaleString("nl-NL")}</p>
                    <p>t/m {a.bezichtigingenInbegrepen} bezichtigingen inbegrepen</p>
                    <p>Daarboven: € {Number(a.tariefPerExtraBezichtiging).toLocaleString("nl-NL")} per extra bezichtiging</p>
                    <p className="mt-1 text-gray-500 italic">
                      Bijv. 5 bezichtigingen = € {(Number(a.tariefVast) + 2 * Number(a.tariefPerExtraBezichtiging)).toLocaleString("nl-NL")}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── TAXATIE ── */}
          {activeTab === "TAXATIE" && (
            <>
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Taxatie bestaat uit een vast tarief plus NWWI registerkosten die apart in rekening worden gebracht.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Vast taxatietarief (€)</label>
                  <input
                    type="number"
                    value={numVal(t.tariefVast)}
                    onChange={(e) => updateTaxatie("tariefVast", e.target.value)}
                    placeholder="bijv. 595"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">Tarief voor de taxatie zelf</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">NWWI registerkosten (€)</label>
                  <input
                    type="number"
                    value={numVal(t.kostenNwwi)}
                    onChange={(e) => updateTaxatie("kostenNwwi", e.target.value)}
                    placeholder="bijv. 125"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">NWWI registerkosten (apart in rekening)</p>
                </div>
              </div>

              {(t.tariefVast || t.kostenNwwi) && (
                <div className="rounded-lg bg-gray-50 px-4 py-3">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Vast tarief</span>
                    <span>€ {Number(t.tariefVast || 0).toLocaleString("nl-NL")}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 mt-1">
                    <span>NWWI kosten</span>
                    <span>€ {Number(t.kostenNwwi || 0).toLocaleString("nl-NL")}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-gray-900 mt-2 border-t border-gray-200 pt-2">
                    <span>Totaal</span>
                    <span>€ {taxatieTotaal.toLocaleString("nl-NL")}</span>
                  </div>
                </div>
              )}
            </>
          )}

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
                    {"options" in f && Array.isArray(f.options) ? (
                      <span className="italic">{(f.options as string[]).join(", ")}</span>
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
