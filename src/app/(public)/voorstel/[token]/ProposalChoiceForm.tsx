"use client";

import { useState } from "react";

const OPTIONS = [
  {
    value: "DIRECT",
    label: "Direct starten",
    description: "Wij mogen na ondertekening direct met de verkoopvoorbereiding starten.",
  },
  {
    value: "SLAPEND",
    label: "Stille verkoop",
    description: "Wij leggen de opdracht vast en stemmen de zichtbaarheid rustig af.",
  },
  {
    value: "UITGESTELD",
    label: "Toekomstig aanbod",
    description: "Wij mogen voorbereiden, maar starten de verkoop later.",
  },
];

export default function ProposalChoiceForm({
  token,
  defaultVerkoopstart,
  defaultStartdatum,
  defaultStartReden,
  defaultEnergielabelChoice,
  defaultEnergielabelNote,
}: {
  token: string;
  defaultVerkoopstart: string;
  defaultStartdatum: string;
  defaultStartReden: string;
  defaultEnergielabelChoice: string;
  defaultEnergielabelNote: string;
}) {
  const [verkoopstart, setVerkoopstart] = useState(defaultVerkoopstart || "DIRECT");
  const [startdatum, setStartdatum] = useState(defaultStartdatum || "");
  const [startReden, setStartReden] = useState(defaultStartReden || "");
  const [energielabelChoice, setEnergielabelChoice] = useState(defaultEnergielabelChoice || "AANWEZIG_OF_ZELF");
  const [energielabelNote, setEnergielabelNote] = useState(defaultEnergielabelNote || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/public/otd/proposal/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verkoopstart, startdatum, startReden, energielabelChoice, energielabelNote }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.signingUrl) {
        setError(data.error || "Akkoord kon niet worden verwerkt");
        return;
      }
      window.location.href = data.signingUrl;
    } catch {
      setError("Akkoord kon niet worden verwerkt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Uw keuze</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setVerkoopstart(option.value)}
            className={`min-h-[116px] rounded-lg border p-4 text-left transition ${
              verkoopstart === option.value
                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">{option.description}</span>
          </button>
        ))}
      </div>

      {verkoopstart !== "DIRECT" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Beoogde startdatum</span>
            <input
              type="date"
              value={startdatum}
              onChange={(event) => setStartdatum(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Toelichting</span>
            <input
              type="text"
              value={startReden}
              onChange={(event) => setStartReden(event.target.value)}
              placeholder={verkoopstart === "SLAPEND" ? "Bijvoorbeeld: eerst stille verkoop" : "Bijvoorbeeld: starten per genoemde datum"}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Energielabel</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          Voor verkoop is een geldig energielabel nodig. Als dit al aanwezig is of u dit zelf regelt, nemen wij hiervoor geen kosten op.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEnergielabelChoice("AANWEZIG_OF_ZELF")}
            className={`rounded-lg border p-4 text-left transition ${
              energielabelChoice === "AANWEZIG_OF_ZELF"
                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold">Al aanwezig of zelf regelen</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">Geen kosten via De Vree Makelaardij.</span>
          </button>
          <button
            type="button"
            onClick={() => setEnergielabelChoice("VIA_MAKELAAR")}
            className={`rounded-lg border p-4 text-left transition ${
              energielabelChoice === "VIA_MAKELAAR"
                ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-semibold">Via De Vree regelen</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">Alleen als er nog geen geldig energielabel is.</span>
          </button>
        </div>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-gray-600">Toelichting energielabel</span>
          <input
            type="text"
            value={energielabelNote}
            onChange={(event) => setEnergielabelNote(event.target.value)}
            placeholder="Bijvoorbeeld: energielabel is al geldig of opdrachtgever regelt dit zelf"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
          />
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {loading ? "Tekenverzoek klaarzetten..." : "Akkoord en naar ondertekenen"}
      </button>
    </div>
  );
}
