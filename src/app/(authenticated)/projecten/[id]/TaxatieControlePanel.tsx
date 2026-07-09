"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

interface ChecklistItem {
  key: string;
  label: string;
  phase: string;
}

interface TaxatieArchive {
  id: string;
  messageId: string;
  mailbox: string;
  fromEmail: string | null;
  subject: string | null;
  receivedAt: string | null;
  matchStatus: string;
  archiveStatus: string;
  matchScore: number | null;
  suggestedSubfolder: string | null;
  nextcloudPath: string | null;
  error: string | null;
  updatedAt: string;
}

interface TaxatieTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  notionPageId: string | null;
  updatedAt: string;
}

interface TaxatieControleData {
  checklist: ChecklistItem[];
  archives: TaxatieArchive[];
  tasks: TaxatieTask[];
}

function statusTone(status: string) {
  if (["archived", "matched", "afgerond"].includes(status)) return "bg-green-100 text-green-700";
  if (["ambiguous", "review_needed", "bezig"].includes(status)) return "bg-amber-100 text-amber-700";
  if (["failed", "unmatched"].includes(status)) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TaxatieControlePanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TaxatieControleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/taxaties/controle?projectId=${projectId}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Taxatiecontrole ophalen mislukt");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Taxatiecontrole ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const taskByChecklistKey = useMemo(() => {
    const map = new Map<string, TaxatieTask>();
    for (const task of data?.tasks || []) {
      const key = task.notionPageId?.split(":").at(-1);
      if (key) map.set(key, task);
    }
    return map;
  }, [data?.tasks]);

  const groupedChecklist = useMemo(() => {
    const groups = new Map<string, ChecklistItem[]>();
    for (const item of data?.checklist || []) {
      groups.set(item.phase, [...(groups.get(item.phase) || []), item]);
    }
    return Array.from(groups.entries());
  }, [data?.checklist]);

  const reviewCount = (data?.archives || []).filter((archive) =>
    ["ambiguous", "unmatched"].includes(archive.matchStatus) || ["review_needed", "failed"].includes(archive.archiveStatus)
  ).length;

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Taxatiecontrole laden...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Taxatiecontrole</p>
            <h3 className="mt-1 text-lg font-semibold text-gray-900">Mailarchief en werkblad-taken</h3>
            <p className="mt-1 text-sm text-gray-500">
              Controleer hier per taxatie welke mails zijn gekoppeld, welke stukken zijn opgeslagen en welke checklisttaken zijn bijgewerkt.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Vernieuwen
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Mails</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{data?.archives.length || 0}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Controle nodig</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">{reviewCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Taxatietaken</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{data?.tasks.length || 0}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">Werkblad-checklist</h3>
          <div className="mt-4 space-y-5">
            {groupedChecklist.map(([phase, items]) => (
              <div key={phase}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{phase}</p>
                <div className="space-y-2">
                  {items.map((item) => {
                    const task = taskByChecklistKey.get(item.key);
                    const done = task?.status === "afgerond";
                    return (
                      <div key={item.key} className="flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-2">
                        {done ? (
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                        ) : task ? (
                          <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        ) : (
                          <DocumentTextIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">{item.label}</p>
                          {task && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              {task.status} · bijgewerkt {formatDate(task.updatedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">Gekoppelde taxatiemails</h3>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            {(data?.archives.length || 0) === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Nog geen taxatiemails gekoppeld.</div>
            ) : (
              <div className="divide-y divide-gray-200">
                {data?.archives.map((archive) => (
                  <div key={archive.id} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{archive.subject || "(zonder onderwerp)"}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {archive.fromEmail || archive.mailbox} · {formatDate(archive.receivedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(archive.matchStatus)}`}>
                          {archive.matchStatus}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(archive.archiveStatus)}`}>
                          {archive.archiveStatus}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-2">
                      <p>Score: {archive.matchScore ?? "-"}</p>
                      <p>Map: {archive.suggestedSubfolder || "-"}</p>
                      <p className="sm:col-span-2">Nextcloud: {archive.nextcloudPath || "-"}</p>
                      {archive.error && (
                        <p className="sm:col-span-2 inline-flex items-center gap-1 text-red-700">
                          <ExclamationCircleIcon className="h-4 w-4" />
                          {archive.error}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
