"use client";

import { Squares2X2Icon } from "@heroicons/react/24/outline";

export default function NotionPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notion</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bekijk en bewerk Notion pagina&apos;s
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-12">
        <Squares2X2Icon className="mb-4 h-12 w-12 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-600">
          Notion integratie
        </h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-400">
          De Notion integratie wordt in een volgende fase gekoppeld via n8n
          workflows. Hier komen veelgebruikte pagina&apos;s en databases.
        </p>
      </div>
    </div>
  );
}
