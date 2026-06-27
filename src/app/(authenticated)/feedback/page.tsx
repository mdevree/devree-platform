"use client";

import { useEffect, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

type FeedbackItem = {
  id: string;
  kind: string;
  title: string | null;
  message: string;
  expected: string | null;
  status: string;
  priority: string;
  pageUrl: string;
  path: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  internalNotes: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_behandeling: "In behandeling",
  opgelost: "Opgelost",
  afgewezen: "Afgewezen",
};

const STATUS_STYLES: Record<string, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-700",
  in_behandeling: "border-blue-200 bg-blue-50 text-blue-700",
  opgelost: "border-green-200 bg-green-50 text-green-700",
  afgewezen: "border-gray-200 bg-gray-50 text-gray-600",
};

const PRIORITY_STYLES: Record<string, string> = {
  laag: "border-gray-200 bg-gray-50 text-gray-600",
  normaal: "border-slate-200 bg-slate-50 text-slate-600",
  hoog: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "in_behandeling", label: "In behandeling" },
  { value: "opgelost", label: "Opgelost" },
  { value: "all", label: "Alles" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  async function loadFeedback() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/feedback?status=${filter}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Feedback kon niet worden geladen");
      }
      setItems(data.feedback || []);
      setCounts(data.counts || {});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function updateStatus(id: string, status: string) {
    setSavingId(id);
    setError("");
    try {
      const response = await fetch(`/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Status kon niet worden opgeslagen");
      }
      setItems((current) => current.map((item) => item.id === id ? data.feedback : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Er ging iets mis");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
          <p className="mt-1 text-sm text-gray-500">
            Meldingen vanuit het platform, inclusief pagina en afzender.
          </p>
        </div>
        <button
          type="button"
          onClick={loadFeedback}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Vernieuwen
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              filter === item.value
                ? "bg-primary text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
            Open
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{counts.open || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ClockIcon className="h-5 w-5 text-blue-500" />
            In behandeling
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{counts.in_behandeling || 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            Opgelost
          </div>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{counts.opgelost || 0}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Feedback laden...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Geen feedback gevonden.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status] || STATUS_STYLES.open}`}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.normaal}`}>
                        {item.priority}
                      </span>
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
                        {item.kind}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-gray-900">
                      {item.title || item.message.slice(0, 90)}
                    </h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.message}</p>
                    {item.expected && (
                      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Verwachting</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{item.expected}</p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{formatDate(item.createdAt)}</span>
                      <span>{item.reporterName || item.reporterEmail || "Onbekende gebruiker"}</span>
                      <a
                        href={item.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-w-full truncate text-primary hover:underline"
                      >
                        {item.path || item.pageUrl}
                      </a>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingId === item.id || item.status === "in_behandeling"}
                      onClick={() => updateStatus(item.id, "in_behandeling")}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Pak op
                    </button>
                    <button
                      type="button"
                      disabled={savingId === item.id || item.status === "opgelost"}
                      onClick={() => updateStatus(item.id, "opgelost")}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Opgelost
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
