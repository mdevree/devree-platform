"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PhoneArrowUpRightIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

type AiCallJob = {
  id: string;
  source: string;
  contactName: string | null;
  contactPhone: string | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  status: string;
  scriptPreview: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

type FollowUpDraft = {
  id: string;
  channel: string;
  purpose: string;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  body: string;
  status: string;
  deliveryError: string | null;
  createdAt: string;
};

type LinkItem = {
  id: string;
  title: string;
  url: string;
  type: string;
  source: string;
  active: boolean;
  intents: unknown;
  lastSyncedAt: string | null;
};

type CallerStatus = {
  callerConfigured: boolean;
  startWebhookConfigured: boolean;
  infoEmailWebhookConfigured: boolean;
  humanApprovalRequired: boolean;
  canPlaceCalls: boolean;
  status: string;
};

function statusStyle(status: string) {
  if (["ready", "approved"].includes(status)) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (["calling"].includes(status)) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (["completed", "sent"].includes(status)) return "bg-green-50 text-green-700 ring-green-200";
  if (["failed", "rejected"].includes(status)) return "bg-red-50 text-red-700 ring-red-200";
  return "bg-gray-50 text-gray-700 ring-gray-200";
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ${statusStyle(value)}`}>
      {value}
    </span>
  );
}

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Actie mislukt");
  return data as T;
}

export default function AiBelassistentDashboard() {
  const [jobs, setJobs] = useState<AiCallJob[]>([]);
  const [drafts, setDrafts] = useState<FollowUpDraft[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [agendaAfspraakId, setAgendaAfspraakId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [draftBodies, setDraftBodies] = useState<Record<string, string>>({});
  const [callerStatus, setCallerStatus] = useState<CallerStatus | null>(null);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || jobs[0] || null,
    [jobs, selectedJobId]
  );

  const loadAll = useCallback(async () => {
    setError(null);
    const [loadedJobs, loadedDrafts, loadedLinks, loadedCallerStatus] = await Promise.all([
      jsonFetch<AiCallJob[]>("/api/ai/call-jobs"),
      jsonFetch<FollowUpDraft[]>("/api/ai/follow-up-drafts"),
      jsonFetch<LinkItem[]>("/api/ai/link-catalog"),
      jsonFetch<CallerStatus>("/api/ai/caller-status"),
    ]);
    setJobs(loadedJobs);
    setDrafts(loadedDrafts);
    setLinks(loadedLinks);
    setCallerStatus(loadedCallerStatus);
    setDraftBodies(Object.fromEntries(loadedDrafts.map((draft) => [draft.id, draft.body])));
    setSelectedJobId((current) => current || loadedJobs[0]?.id || null);
  }, []);

  useEffect(() => {
    void loadAll().catch((err) => setError(err instanceof Error ? err.message : "Laden mislukt"));
  }, [loadAll]);

  async function runAction<T>(label: string, action: () => Promise<T>, success: string) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Actie mislukt");
    } finally {
      setBusy(null);
    }
  }

  async function createJob() {
    if (!agendaAfspraakId.trim()) {
      setError("Vul een agenda-afspraak ID in.");
      return;
    }
    await runAction(
      "create-job",
      () =>
        jsonFetch("/api/ai/call-jobs", {
          method: "POST",
          body: JSON.stringify({ agendaAfspraakId: agendaAfspraakId.trim() }),
        }),
      "Belkaart aangemaakt."
    );
    setAgendaAfspraakId("");
  }

  async function updateJob(job: AiCallJob, patch: Partial<AiCallJob>) {
    await runAction(
      `job-${job.id}`,
      () =>
        jsonFetch(`/api/ai/call-jobs/${job.id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      "Belkaart bijgewerkt."
    );
  }

  async function startJob(job: AiCallJob) {
    await runAction(
      `start-${job.id}`,
      () =>
        jsonFetch(`/api/ai/call-jobs/${job.id}/start`, {
          method: "POST",
          body: JSON.stringify({ startedBy: "platform", reviewedBy: "platform", humanApproved: true }),
        }),
      "Belkaart doorgestuurd naar de caller."
    );
  }

  async function saveDraft(draft: FollowUpDraft) {
    await runAction(
      `draft-${draft.id}`,
      () =>
        jsonFetch(`/api/ai/follow-up-drafts/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body: draftBodies[draft.id] || draft.body, status: "approved", reviewedBy: "platform" }),
        }),
      "Concept opgeslagen en goedgekeurd."
    );
  }

  async function sendDraft(draft: FollowUpDraft) {
    await runAction(
      `send-${draft.id}`,
      () =>
        jsonFetch(`/api/ai/follow-up-drafts/${draft.id}/send`, {
          method: "POST",
          body: JSON.stringify({ reviewedBy: "platform" }),
        }),
      "WhatsApp-concept verzonden."
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">AI Belassistent</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Bereid belkaarten voor, beheer de toegestane links en keur follow-up berichten goed voordat ze naar WhatsApp gaan.
          </p>
        </div>
        <button
          onClick={() =>
            runAction("sync-links", () => jsonFetch("/api/ai/link-catalog/sync", { method: "POST" }), "Linkcatalogus gesynchroniseerd.")
          }
          disabled={busy === "sync-links"}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          <ArrowPathIcon className={`h-4 w-4 ${busy === "sync-links" ? "animate-spin" : ""}`} />
          Links syncen
        </button>
      </div>

      {callerStatus && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            callerStatus.canPlaceCalls
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheckIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  {callerStatus.canPlaceCalls ? "Caller is gekoppeld" : "Caller nog niet gekoppeld"}
                </p>
                <p className="mt-1 text-sm">
                  Menselijke goedkeuring is verplicht.{" "}
                  {callerStatus.canPlaceCalls
                    ? "Goedgekeurde belkaarten worden doorgestuurd naar de AI/PBX-caller."
                    : "Goedgekeurde belkaarten worden nu alleen klaargezet; stel AI_CALL_START_WEBHOOK_URL in om echt te bellen."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusPill value={callerStatus.startWebhookConfigured ? "start-webhook actief" : "start-webhook mist"} />
              <StatusPill value={callerStatus.infoEmailWebhookConfigured ? "info-mail actief" : "info-mail mist"} />
            </div>
          </div>
        </div>
      )}

      {(message || error) && (
        <div className={`rounded-md border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
          {error || message}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Belkaarten</h2>
              <p className="text-sm text-gray-500">Maak de context klaar voordat de caller mag bellen.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={agendaAfspraakId}
                onChange={(event) => setAgendaAfspraakId(event.target.value)}
                placeholder="Agenda-afspraak ID"
                className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={createJob}
                disabled={busy === "create-job"}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <PlusIcon className="h-4 w-4" />
                Belkaart
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {jobs.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Nog geen belkaarten.</p>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${selectedJob?.id === job.id ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{job.contactName || "Onbekende kijker"}</p>
                      <p className="truncate text-sm text-gray-500">{job.propertyTitle || job.propertyAddress || "Geen woningcontext"}</p>
                    </div>
                    <StatusPill value={job.status} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-4">
            <h2 className="text-base font-semibold text-gray-900">Scriptcontrole</h2>
            <p className="text-sm text-gray-500">{selectedJob ? selectedJob.id : "Selecteer een belkaart."}</p>
          </div>
          {selectedJob ? (
            <div className="space-y-4 p-4">
              <div className="space-y-1 text-sm">
                <p className="font-medium text-gray-900">{selectedJob.contactName || "Onbekende kijker"}</p>
                <p className="text-gray-600">{selectedJob.contactPhone || "Geen telefoonnummer"}</p>
                <p className="text-gray-600">{selectedJob.propertyTitle || selectedJob.propertyAddress || "Geen woning"}</p>
              </div>
              <textarea
                value={selectedJob.scriptPreview || ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setJobs((current) => current.map((job) => (job.id === selectedJob.id ? { ...job, scriptPreview: value } : job)));
                }}
                className="min-h-64 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateJob(selectedJob, { scriptPreview: selectedJob.scriptPreview || "", status: "ready" })}
                  disabled={busy === `job-${selectedJob.id}`}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  Opslaan
                </button>
                <button
                  onClick={() => startJob(selectedJob)}
                  disabled={busy === `start-${selectedJob.id}` || !selectedJob.contactPhone}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  <PhoneArrowUpRightIcon className="h-4 w-4" />
                  Start caller
                </button>
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-gray-500">Geen belkaart geselecteerd.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900">WhatsApp-concepten</h2>
          <p className="text-sm text-gray-500">Hier blijft menselijke goedkeuring tussen de AI en de klant.</p>
        </div>
        <div className="divide-y divide-gray-100">
          {drafts.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nog geen concepten.</p>
          ) : (
            drafts.map((draft) => (
              <div key={draft.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{draft.recipientName || draft.recipientPhone || draft.recipientEmail || "Ontvanger onbekend"}</p>
                    <p className="text-sm text-gray-500">{draft.channel} · {draft.purpose}</p>
                  </div>
                  <StatusPill value={draft.status} />
                </div>
                <textarea
                  value={draftBodies[draft.id] ?? draft.body}
                  onChange={(event) => setDraftBodies((current) => ({ ...current, [draft.id]: event.target.value }))}
                  className="min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {draft.deliveryError && <p className="text-sm text-red-600">{draft.deliveryError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => saveDraft(draft)}
                    disabled={busy === `draft-${draft.id}`}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                    Goedkeuren
                  </button>
                  <button
                    onClick={() => sendDraft(draft)}
                    disabled={busy === `send-${draft.id}` || draft.channel !== "whatsapp"}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    <PaperAirplaneIcon className="h-4 w-4" />
                    Verzenden
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-base font-semibold text-gray-900">Linkcatalogus</h2>
          <p className="text-sm text-gray-500">Toegestane links voor de AI: diensten, aanbod, actieve woningen en vragen.</p>
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Titel</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Bron</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {links.map((link) => (
                <tr key={link.id}>
                  <td className="max-w-xl px-4 py-2">
                    <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline">
                      <LinkIcon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{link.title}</span>
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{link.type}</td>
                  <td className="px-4 py-2 text-gray-600">{link.source}</td>
                  <td className="px-4 py-2">
                    <StatusPill value={link.active ? "actief" : "uit"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
