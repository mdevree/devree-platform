"use client";

import { useCallback, useState } from "react";
import { ArrowUpTrayIcon, DocumentIcon } from "@heroicons/react/24/outline";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export default function UploadZone({ onFileSelected, isLoading }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".xls") && !file.name.endsWith(".xlsx")) {
        alert("Upload een .xls bestand (Realworks export)");
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-gray-300 bg-gray-50 hover:border-gray-400"
      }`}
    >
      {isLoading ? (
        <>
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-primary" />
          <p className="text-sm font-medium text-gray-700">Bestand verwerken…</p>
        </>
      ) : (
        <>
          <ArrowUpTrayIcon className="mb-4 h-10 w-10 text-gray-400" />
          <p className="mb-1 text-sm font-medium text-gray-700">
            Sleep een Realworks .xls bestand hierheen
          </p>
          <p className="mb-4 text-xs text-gray-500">of klik om te uploaden</p>
          <label className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark">
            Bestand kiezen
            <input
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          <div className="mt-6 flex items-center gap-2 text-xs text-gray-400">
            <DocumentIcon className="h-4 w-4" />
            <span>Ondersteund: Realworks &quot;Overzicht&quot; export (.xls)</span>
          </div>
        </>
      )}
    </div>
  );
}
