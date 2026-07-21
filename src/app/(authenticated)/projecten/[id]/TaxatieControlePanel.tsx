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

interface SourceReference {
  type: string;
  document?: string;
  path?: string;
  page?: number;
  field?: string;
  extract?: string;
}

interface SourceObservation {
  id: string;
  value: string | number | boolean;
  normalizedValue: string | number | boolean;
  unit?: string;
  source: SourceReference;
  observedAt?: string;
  recordedAt: string;
  recordedBy: string;
}

interface SourceValidationField {
  key: string;
  label: string;
  dataType: "string" | "number" | "boolean" | "date";
  unit?: string;
  status: "unresolved" | "conflict" | "confirmed";
  sourceValues: SourceObservation[];
  distinctValues: Array<string | number | boolean>;
  taxateur_bevestigd: {
    active: boolean;
    value: string | number | boolean;
    confirmedBy: string;
    confirmedAt: string;
    method: "source" | "manual";
  } | null;
  lastEvaluatedAt: string;
}

interface SourceValidationData {
  available: boolean;
  error?: string;
  dossierPath?: string;
  exists?: boolean;
  fields: SourceValidationField[];
  openConflicts: string[];
  unresolvedFields: string[];
  exportReady: boolean;
}

interface TaxatieControleData {
  checklist: ChecklistItem[];
  archives: TaxatieArchive[];
  tasks: TaxatieTask[];
  sourceValidation: SourceValidationData;
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

function sourceLabel(source: SourceReference) {
  const location = [source.document || source.path, source.page ? `pagina ${source.page}` : null, source.field]
    .filter(Boolean)
    .join(" · ");
  return location || source.type;
}

export default function TaxatieControlePanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TaxatieControleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

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

  const confirmSourceValue = useCallback(async (
    field: SourceValidationField,
    selection: { sourceValueId: string } | { manualValue: string }
  ) => {
    setSavingField(field.key);
    setReviewError(null);
    try {
      const response = await fetch("/api/taxaties/conflicten/bevestig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          field: field.key,
          ...selection,
          note: reviewNotes[field.key] || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Bronwaarde bevestigen mislukt");
      setManualValues((current) => ({ ...current, [field.key]: "" }));
      setReviewNotes((current) => ({ ...current, [field.key]: "" }));
      setEditingField(null);
      await fetchData();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Bronwaarde bevestigen mislukt");
    } finally {
      setSavingField(null);
    }
  }, [fetchData, projectId, reviewNotes]);

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
  const openSourceValueCount = (data?.sourceValidation?.openConflicts.length || 0) +
    (data?.sourceValidation?.unresolvedFields.length || 0);

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
            <h3 className="mt-1 text-lg font-semibold text-gray-900">Dossier-, bronwaarde- en werkbladcontrole</h3>
            <p className="mt-1 text-sm text-gray-500">
              Controleer hier welke stukken zijn opgeslagen, welke checklisttaken zijn bijgewerkt en welke bronwaarden nog taxateursbevestiging nodig hebben.
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Open bronwaarden</p>
            <p className={`mt-1 text-2xl font-semibold ${openSourceValueCount ? "text-red-700" : "text-green-700"}`}>
              {openSourceValueCount}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Review bronwaarden</h3>
            <p className="mt-1 text-sm text-gray-500">
              Een waarde stroomt pas door naar rapport- en exportvelden nadat een taxateur haar hier bevestigt.
            </p>
          </div>
          {data?.sourceValidation?.available && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${data.sourceValidation.exportReady ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {data.sourceValidation.exportReady ? "Export gereed" : "Export geblokkeerd"}
            </span>
          )}
        </div>

        {!data?.sourceValidation?.available ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {data?.sourceValidation?.error || "Bronwaardecontrole is nog niet beschikbaar."}
          </div>
        ) : (data.sourceValidation.fields.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-500">
            Nog geen bronwaarden geregistreerd in dossier.json.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {reviewError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{reviewError}</div>
            )}
            {data.sourceValidation.fields.map((field) => {
              const isOpen = field.status !== "confirmed";
              const showReview = isOpen || editingField === field.key;
              const saving = savingField === field.key;
              return (
                <div key={field.key} className={`rounded-lg border p-4 ${field.status === "conflict" ? "border-red-200 bg-red-50/40" : field.status === "unresolved" ? "border-amber-200 bg-amber-50/40" : "border-green-200 bg-green-50/40"}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{field.label}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {field.sourceValues.length} bron{field.sourceValues.length === 1 ? "" : "nen"} · {field.distinctValues.length} unieke waarde{field.distinctValues.length === 1 ? "" : "n"}
                      </p>
                    </div>
                    <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${field.status === "conflict" ? "bg-red-100 text-red-700" : field.status === "unresolved" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                      {field.status}
                    </span>
                  </div>

                  {field.status === "confirmed" && field.taxateur_bevestigd?.active && !showReview ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-green-800">
                        Bevestigd: <strong>{String(field.taxateur_bevestigd.value)} {field.unit || ""}</strong> door {field.taxateur_bevestigd.confirmedBy} op {formatDate(field.taxateur_bevestigd.confirmedAt)}.
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingField(field.key)}
                        className="w-fit rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50"
                      >
                        Bevestiging herzien
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid gap-2">
                        {field.sourceValues.map((sourceValue) => (
                          <div key={sourceValue.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{String(sourceValue.value)} {sourceValue.unit || field.unit || ""}</p>
                              <p className="mt-1 text-xs text-gray-500">{sourceLabel(sourceValue.source)}</p>
                              {sourceValue.source.extract && <p className="mt-1 text-xs text-gray-600">“{sourceValue.source.extract}”</p>}
                              <p className="mt-1 text-[11px] text-gray-400">Geregistreerd {formatDate(sourceValue.recordedAt)} door {sourceValue.recordedBy}</p>
                            </div>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => confirmSourceValue(field, { sourceValueId: sourceValue.id })}
                              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {saving ? "Opslaan..." : "Bevestig deze waarde"}
                            </button>
                          </div>
                        ))}
                      </div>
                      {showReview && (
                        <div className="mt-3 grid gap-2 border-t border-gray-200 pt-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
                          <input
                            type="text"
                            inputMode={field.dataType === "number" ? "decimal" : "text"}
                            value={manualValues[field.key] || ""}
                            onChange={(event) => setManualValues((current) => ({ ...current, [field.key]: event.target.value }))}
                            placeholder={`Handmatige waarde${field.unit ? ` (${field.unit})` : ""}`}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="text"
                            value={reviewNotes[field.key] || ""}
                            onChange={(event) => setReviewNotes((current) => ({ ...current, [field.key]: event.target.value }))}
                            placeholder="Toelichting (optioneel)"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            disabled={saving || !(manualValues[field.key] || "").trim()}
                            onClick={() => confirmSourceValue(field, { manualValue: manualValues[field.key] })}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Handmatig bevestigen
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
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
