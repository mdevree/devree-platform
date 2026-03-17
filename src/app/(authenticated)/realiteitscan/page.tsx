"use client";

import { useState } from "react";
import { MagnifyingGlassCircleIcon } from "@heroicons/react/24/outline";
import { parseXLS, type WoningRecord } from "./actions";
import UploadZone from "./components/UploadZone";
import Dashboard from "./components/Dashboard";

export default function RealiteitscanPage() {
  const [records, setRecords] = useState<WoningRecord[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    setIsLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await parseXLS(formData);

      if (result.length === 0) {
        setError(
          "Geen woningen gevonden in dit bestand. Controleer of het een Realworks \"Overzicht\" export is."
        );
        setRecords(null);
      } else {
        setRecords(result);
      }
    } catch {
      setError(
        "Kon het bestand niet verwerken. Zorg dat het een geldig Realworks .xls bestand is."
      );
      setRecords(null);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setRecords(null);
    setFileName("");
    setError(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Titel */}
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-900">
          <MagnifyingGlassCircleIcon className="h-8 w-8 text-primary" />
          Realiteitscan
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload een Realworks export en ontdek wat er realistisch mogelijk is
          binnen een bepaald budget en wensenpakket.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload of Dashboard */}
      {records ? (
        <Dashboard
          records={records}
          fileName={fileName}
          onReset={handleReset}
        />
      ) : (
        <UploadZone onFileSelected={handleFileSelected} isLoading={isLoading} />
      )}
    </div>
  );
}
