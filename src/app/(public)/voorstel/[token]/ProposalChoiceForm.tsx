"use client";

import { useState } from "react";

const OPTIONS = [
  {
    value: "DIRECT",
    label: "Direct starten",
    description: "Na ondertekening nemen wij zo snel mogelijk contact op om de fotograaf in te plannen.",
  },
  {
    value: "UITGESTELD",
    label: "Toekomstig aanbod",
    description: "Wij mogen alvast voorbereiden, maar brengen de woning later actief onder de aandacht.",
  },
];

export default function ProposalChoiceForm({
  token,
  defaultVerkoopstart,
  defaultStartdatum,
  defaultStartReden,
  defaultSilentSale,
  defaultRemarks,
  defaultEnergielabelChoice,
  defaultEnergielabelNote,
  energielabelKosten,
}: {
  token: string;
  defaultVerkoopstart: string;
  defaultStartdatum: string;
  defaultStartReden: string;
  defaultSilentSale: boolean;
  defaultRemarks: string;
  defaultEnergielabelChoice: string;
  defaultEnergielabelNote: string;
  energielabelKosten: number;
}) {
  const initialVerkoopstart = defaultVerkoopstart === "SLAPEND" ? "UITGESTELD" : defaultVerkoopstart || "DIRECT";
  const [verkoopstart, setVerkoopstart] = useState(initialVerkoopstart);
  const [startdatum, setStartdatum] = useState(defaultStartdatum || "");
  const [startReden, setStartReden] = useState(defaultStartReden || "");
  const [silentSale, setSilentSale] = useState(defaultSilentSale || defaultVerkoopstart === "SLAPEND");
  const [remarks, setRemarks] = useState(defaultRemarks || "");
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
        body: JSON.stringify({ verkoopstart, startdatum, startReden, silentSale, remarks, energielabelChoice, energielabelNote }),
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
        <div className="mt-4 space-y-3">
          <label className="block max-w-sm">
            <span className="text-xs font-medium text-gray-600">Beoogde startdatum</span>
            <input
              type="date"
              value={startdatum}
              onChange={(event) => setStartdatum(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
          <label className="flex gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <input
              type="checkbox"
              checked={silentSale}
              onChange={(event) => setSilentSale(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-700"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Stille verkoop</span>
              <span className="mt-1 block text-xs leading-5 text-gray-500">
                Wij zorgen dat het object alvast beperkt zichtbaar is in de uitwisselingssystemen, maar brengen de woning nog niet groots openbaar onder de aandacht.
              </span>
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Toelichting</span>
            <input
              type="text"
              value={startReden}
              onChange={(event) => setStartReden(event.target.value)}
              placeholder="Bijvoorbeeld: starten per genoemde datum of eerst alleen voorbereiden"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
            />
          </label>
        </div>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Energielabel</p>
        <p className="mt-1 text-sm leading-6 text-gray-600">
          Indien gewenst zetten wij de opdracht voor u uit om een energielabel te laten opmaken. Een energielabel is verplicht voordat we de woning online publiceren. Als u al een energielabel heeft of dit zelf regelt, kunt u dat hieronder aangeven.
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
            <span className="mt-2 block text-xs leading-5 text-gray-500">
              Alleen als er nog geen geldig energielabel is. Maximaal € {energielabelKosten.toLocaleString("nl-NL")},- incl. btw.
            </span>
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

      <div className="mt-5 border-t border-gray-100 pt-5">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Op- of aanmerkingen</span>
          <span className="mt-1 block text-sm leading-6 text-gray-600">
            Heeft u andere wensen, bijvoorbeeld over vraagprijs of verkoopmethode? Laat het ons weten, dan nemen wij contact met u op om dit te bespreken.
          </span>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-700 focus:ring-emerald-700"
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
