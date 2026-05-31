"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PrinterIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { BuurtdataReport } from "@/components/buurtdata/BuurtdataReport";
import type { BuurtdataResult } from "@/types/buurtdata";

export default function BuurtdataPage() {
  const searchParams = useSearchParams();
  const [postcode, setPostcode] = useState(searchParams.get("postcode") || "");
  const [huisnummer, setHuisnummer] = useState(searchParams.get("huisnummer") || "");
  const [huisletter, setHuisletter] = useState("");
  const [toevoeging, setToevoeging] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BuurtdataResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch("/api/buurtdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.replace(/\s/g, "").toUpperCase(),
          huisnummer: parseInt(huisnummer, 10),
          huisletter: huisletter.trim() || null,
          huisnummer_toevoeging: toevoeging.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Onbekende fout");
        return;
      }

      const result = Array.isArray(json) ? json[0] : json;
      if (!result) {
        setError("Geen data ontvangen voor dit adres");
        return;
      }

      setData(result);
    } catch {
      setError("Kan geen verbinding maken met de datadienst");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* ── Form – verborgen bij afdrukken ── */}
      <div className="print-hidden-form mb-8 print:hidden">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Buurtdata</h1>
            <p className="mt-1 text-sm text-gray-500">
              Haal uitgebreide buurt- en omgevingsinformatie op voor elk adres.
            </p>
          </div>
          {data && (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <PrinterIcon className="h-4 w-4" />
              Rapport afdrukken
            </button>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Postcode <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="1234AB"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Huisnummer <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={huisnummer}
                onChange={(e) => setHuisnummer(e.target.value)}
                placeholder="1"
                required
                min="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Huisletter</label>
              <input
                type="text"
                value={huisletter}
                onChange={(e) => setHuisletter(e.target.value)}
                placeholder="A"
                maxLength={1}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Toevoeging</label>
              <input
                type="text"
                value={toevoeging}
                onChange={(e) => setToevoeging(e.target.value)}
                placeholder="bis"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              {loading ? "Ophalen…" : "Rapport ophalen"}
            </button>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </form>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 print:hidden">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-gray-500">Data ophalen, even geduld…</p>
          </div>
        </div>
      )}

      {/* ── Report ── */}
      {data && !loading && <BuurtdataReport data={data} />}
    </div>
  );
}
