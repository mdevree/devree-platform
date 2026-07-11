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
  CursorArrowRaysIcon,
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
  mauticContactId: number | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  body: string;
  status: string;
  createdBy: string;
  deliveryError: string | null;
  createdAt: string;
  sentAt: string | null;
  activity?: {
    trackedUrls: string[];
    clickCount: number;
    lastClickedAt: string | null;
    lastClickedUrl: string | null;
    eventTypes: string[];
  };
};

type PrepareBezichtigingenResult = {
  ok: boolean;
  enabled: boolean;
  dryRun: boolean;
  created: { draftId: string | null; afspraakId: string; recipientName: string | null }[];
  skipped: { afspraakId: string; systemid: number | null; reason: string }[];
  errors: { afspraakId: string; message: string }[];
};

type PrepareLastRun = {
  at?: string;
  created?: number;
  skipped?: { afspraakId: string; reason: string }[];
  errors?: { afspraakId: string; message: string }[];
} | null;

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

type AgentProfile = {
  id: string;
  displayName: string;
  roleDescription: string;
  toneOfVoice: string | null;
  basePrompt: string;
  rules: unknown;
  forbiddenCommitments: unknown;
  domainVocabulary: unknown;
};

type AgentTask = {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  goal: string;
  channel: string;
  questions: unknown;
  allowedActions: unknown;
  followUpPolicy: unknown;
  active: boolean;
};

type TabKey = "overzicht" | "bellen" | "concepten" | "kennis" | "profiel";

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

const draftFilters = [
  { value: "active", label: "Actief" },
  { value: "draft", label: "Concept" },
  { value: "approved", label: "Goedgekeurd" },
  { value: "sent", label: "Verzonden" },
  { value: "rejected", label: "Afgewezen" },
  { value: "alle", label: "Alles" },
];

const tabs: { key: TabKey; label: string }[] = [
  { key: "overzicht", label: "Overzicht" },
  { key: "bellen", label: "Bellen" },
  { key: "concepten", label: "Concepten" },
  { key: "kennis", label: "Kennis & links" },
  { key: "profiel", label: "Profiel & taken" },
];

function formatDateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function jsonArrayToText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function textToLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
  const [agentProfile, setAgentProfile] = useState<AgentProfile | null>(null);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [profileDraft, setProfileDraft] = useState<Partial<AgentProfile> & {
    rulesText?: string;
    forbiddenText?: string;
    vocabularyText?: string;
  }>({});
  const [taskDrafts, setTaskDrafts] = useState<Record<string, Partial<AgentTask> & {
    questionsText?: string;
    actionsText?: string;
  }>>({});
  const [agendaAfspraakId, setAgendaAfspraakId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [draftBodies, setDraftBodies] = useState<Record<string, string>>({});
  const [callerStatus, setCallerStatus] = useState<CallerStatus | null>(null);
  const [draftStatusFilter, setDraftStatusFilter] = useState("active");
  const [activeTab, setActiveTab] = useState<TabKey>("overzicht");
  const [prepareResult, setPrepareResult] = useState<PrepareBezichtigingenResult | null>(null);
  const [prepareLastRun, setPrepareLastRun] = useState<PrepareLastRun>(null);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || jobs[0] || null,
    [jobs, selectedJobId]
  );

  const loadAll = useCallback(async () => {
    setError(null);
    const [loadedJobs, loadedDrafts, loadedLinks, loadedCallerStatus, loadedProfile, loadedTasks, loadedPrepareLastRun] = await Promise.all([
      jsonFetch<AiCallJob[]>("/api/ai/call-jobs"),
      jsonFetch<FollowUpDraft[]>(`/api/ai/follow-up-drafts?status=${draftStatusFilter}`),
      jsonFetch<LinkItem[]>("/api/ai/link-catalog"),
      jsonFetch<CallerStatus>("/api/ai/caller-status"),
      jsonFetch<AgentProfile>("/api/ai/agent-profile"),
      jsonFetch<AgentTask[]>("/api/ai/tasks"),
      jsonFetch<{ lastRun: PrepareLastRun }>("/api/ai/follow-up-drafts/prepare-bezichtigingen").catch(() => ({ lastRun: null })),
    ]);
    setJobs(loadedJobs);
    setDrafts(loadedDrafts);
    setLinks(loadedLinks);
    setCallerStatus(loadedCallerStatus);
    setPrepareLastRun(loadedPrepareLastRun.lastRun);
    setAgentProfile(loadedProfile);
    setAgentTasks(loadedTasks);
    setProfileDraft({
      ...loadedProfile,
      rulesText: jsonArrayToText(loadedProfile.rules),
      forbiddenText: jsonArrayToText(loadedProfile.forbiddenCommitments),
      vocabularyText: jsonArrayToText(loadedProfile.domainVocabulary),
    });
    setTaskDrafts(Object.fromEntries(loadedTasks.map((task) => [
      task.id,
      {
        ...task,
        questionsText: jsonArrayToText(task.questions),
        actionsText: jsonArrayToText(task.allowedActions),
      },
    ])));
    setDraftBodies(Object.fromEntries(loadedDrafts.map((draft) => [draft.id, draft.body])));
    setSelectedJobId((current) => current || loadedJobs[0]?.id || null);
  }, [draftStatusFilter]);

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
    const target = [job.contactName, job.contactPhone, job.propertyTitle || job.propertyAddress]
      .filter(Boolean)
      .join(" - ");
    const confirmation = window.prompt(`Typ BEL om deze AI-call handmatig goed te keuren en direct te starten:\n\n${target}`);
    if (confirmation !== "BEL") {
      setMessage(null);
      setError("Start geannuleerd. Typ exact BEL om een AI-call te starten.");
      return;
    }

    await runAction(
      `start-${job.id}`,
      () =>
        jsonFetch(`/api/ai/call-jobs/${job.id}/start`, {
          method: "POST",
          body: JSON.stringify({
            startedBy: "platform",
            reviewedBy: "platform",
            humanApproved: true,
            approvalText: confirmation,
          }),
        }),
      "Belkaart doorgestuurd naar de caller."
    );
  }

  async function prepareBezichtigingen(dryRun: boolean) {
    await runAction(
      "prepare-bezichtigingen",
      async () => {
        const result = await jsonFetch<PrepareBezichtigingenResult>("/api/ai/follow-up-drafts/prepare-bezichtigingen", {
          method: "POST",
          body: JSON.stringify({ dryRun }),
        });
        setPrepareResult(result);
      },
      dryRun ? "Dry-run afgerond, er is niets aangemaakt." : "Bezichtiging-concepten voorbereid."
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

  async function saveProfile() {
    await runAction(
      "agent-profile",
      () =>
        jsonFetch("/api/ai/agent-profile", {
          method: "PATCH",
          body: JSON.stringify({
            displayName: profileDraft.displayName,
            roleDescription: profileDraft.roleDescription,
            toneOfVoice: profileDraft.toneOfVoice,
            basePrompt: profileDraft.basePrompt,
            rules: textToLines(profileDraft.rulesText || ""),
            forbiddenCommitments: textToLines(profileDraft.forbiddenText || ""),
            domainVocabulary: textToLines(profileDraft.vocabularyText || ""),
          }),
        }),
      "Agentprofiel opgeslagen."
    );
  }

  async function saveTask(task: AgentTask) {
    const draft = taskDrafts[task.id] || {};
    await runAction(
      `agent-task-${task.id}`,
      () =>
        jsonFetch("/api/ai/tasks", {
          method: "PATCH",
          body: JSON.stringify({
            id: task.id,
            displayName: draft.displayName,
            description: draft.description,
            goal: draft.goal,
            channel: draft.channel,
            questions: textToLines(draft.questionsText || ""),
            allowedActions: textToLines(draft.actionsText || ""),
          }),
        }),
      "Taakprofiel opgeslagen."
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Digitale medewerker</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Beheer de digitale medewerker, belkaarten, kennislinks en follow-up concepten voordat er iets naar klanten gaat.
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

      <nav className="flex flex-wrap gap-2 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overzicht" && (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Belkaarten</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{jobs.length}</p>
            <p className="mt-1 text-sm text-gray-500">Laatste kaarten en status via tab Bellen.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Concepten actief</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{drafts.length}</p>
            <p className="mt-1 text-sm text-gray-500">WhatsApp/e-mail blijft handmatig te reviewen.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-500">Kennislinks</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{links.filter((link) => link.active).length}</p>
            <p className="mt-1 text-sm text-gray-500">Actieve diensten, vragen en woninglinks.</p>
          </div>
        </section>
      )}

      {activeTab === "bellen" && (
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
      )}

      {activeTab === "concepten" && (
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">WhatsApp-concepten</h2>
              <p className="text-sm text-gray-500">Standaard zie je alleen concepten die nog aandacht nodig hebben.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {draftFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setDraftStatusFilter(filter.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    draftStatusFilter === filter.value
                      ? "border-primary bg-primary text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <button
              onClick={() => prepareBezichtigingen(false)}
              disabled={busy === "prepare-bezichtigingen"}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Bezichtiging-concepten voorbereiden
            </button>
            <button
              onClick={() => prepareBezichtigingen(true)}
              disabled={busy === "prepare-bezichtigingen"}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-60"
            >
              Dry-run
            </button>
            {prepareLastRun?.at && (
              <span className="text-xs text-gray-500">
                Laatste automatische run: {formatDateTime(prepareLastRun.at)} · {prepareLastRun.created ?? 0} aangemaakt
                {prepareLastRun.skipped?.length ? ` · ${prepareLastRun.skipped.length} overgeslagen` : ""}
              </span>
            )}
          </div>
          {prepareResult && (
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-900">
                {prepareResult.dryRun ? "Dry-run: " : ""}
                {prepareResult.created.length} concept{prepareResult.created.length === 1 ? "" : "en"}
                {prepareResult.dryRun ? " zou worden aangemaakt" : " aangemaakt"} · {prepareResult.skipped.length} overgeslagen · {prepareResult.errors.length} fouten
                {!prepareResult.enabled ? " · automatisering staat uit" : ""}
              </p>
              {prepareResult.skipped.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">Overgeslagen bezichtigingen</summary>
                  <ul className="mt-1 space-y-0.5">
                    {prepareResult.skipped.map((skip) => (
                      <li key={skip.afspraakId}>{skip.systemid ?? skip.afspraakId}: {skip.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              {prepareResult.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-red-600">
                  {prepareResult.errors.map((err) => (
                    <li key={err.afspraakId}>{err.afspraakId}: {err.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                    <p className="text-sm text-gray-500">
                      {draft.channel} · {draft.purpose}
                      {draft.sentAt ? ` · verzonden ${formatDateTime(draft.sentAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {draft.createdBy === "auto_bezichtiging" && (
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        Automatisch (bezichtiging)
                      </span>
                    )}
                    <StatusPill value={draft.status} />
                  </div>
                </div>
                {draft.activity && draft.activity.trackedUrls.length > 0 && (
                  <div
                    className={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs ${
                      draft.activity.clickCount > 0
                        ? "bg-green-50 text-green-700"
                        : "bg-gray-50 text-gray-500"
                    }`}
                  >
                    <CursorArrowRaysIcon className="h-4 w-4" />
                    {draft.activity.clickCount > 0 ? (
                      <span>
                        Link bezocht
                        {draft.activity.lastClickedAt ? ` · ${formatDateTime(draft.activity.lastClickedAt)}` : ""}
                      </span>
                    ) : (
                      <span>Nog geen linkbezoek gezien in Mautic</span>
                    )}
                    {draft.activity.lastClickedUrl && (
                      <span className="min-w-0 truncate text-gray-400">{draft.activity.lastClickedUrl}</span>
                    )}
                  </div>
                )}
                <textarea
                  value={draftBodies[draft.id] ?? draft.body}
                  onChange={(event) => setDraftBodies((current) => ({ ...current, [draft.id]: event.target.value }))}
                  className="min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {draft.deliveryError && <p className="text-sm text-red-600">{draft.deliveryError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => saveDraft(draft)}
                    disabled={busy === `draft-${draft.id}` || draft.status === "sent"}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                    Goedkeuren
                  </button>
                  <button
                    onClick={() => sendDraft(draft)}
                    disabled={busy === `send-${draft.id}` || draft.channel !== "whatsapp" || draft.status === "sent"}
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
      )}

      {activeTab === "kennis" && (
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
      )}

      {activeTab === "profiel" && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900">Agentprofiel</h2>
              <p className="text-sm text-gray-500">Basisidentiteit, toon en regels van de digitale medewerker.</p>
            </div>
            {agentProfile ? (
              <div className="space-y-4 p-4">
                <label className="block text-sm font-medium text-gray-700">
                  Naam
                  <input
                    value={profileDraft.displayName || ""}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Rol
                  <textarea
                    value={profileDraft.roleDescription || ""}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, roleDescription: event.target.value }))}
                    className="mt-1 min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Basisprompt
                  <textarea
                    value={profileDraft.basePrompt || ""}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, basePrompt: event.target.value }))}
                    className="mt-1 min-h-40 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Domeinwoorden
                  <textarea
                    value={profileDraft.vocabularyText || ""}
                    onChange={(event) => setProfileDraft((current) => ({ ...current, vocabularyText: event.target.value }))}
                    className="mt-1 min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Regels
                    <textarea
                      value={profileDraft.rulesText || ""}
                      onChange={(event) => setProfileDraft((current) => ({ ...current, rulesText: event.target.value }))}
                      className="mt-1 min-h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Verboden toezeggingen
                    <textarea
                      value={profileDraft.forbiddenText || ""}
                      onChange={(event) => setProfileDraft((current) => ({ ...current, forbiddenText: event.target.value }))}
                      className="mt-1 min-h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </label>
                </div>
                <button
                  onClick={saveProfile}
                  disabled={busy === "agent-profile"}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  Profiel opslaan
                </button>
              </div>
            ) : (
              <p className="p-4 text-sm text-gray-500">Profiel wordt geladen.</p>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 p-4">
              <h2 className="text-base font-semibold text-gray-900">Taken</h2>
              <p className="text-sm text-gray-500">V1 gebruikt bezichtiging nabellen als standaardtaak.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {agentTasks.map((task) => {
                const draft = taskDrafts[task.id] || {};
                return (
                  <div key={task.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{task.displayName}</p>
                        <p className="text-xs text-gray-500">{task.slug} · {task.channel}</p>
                      </div>
                      <StatusPill value={task.active ? "actief" : "inactief"} />
                    </div>
                    <label className="block text-sm font-medium text-gray-700">
                      Doel
                      <textarea
                        value={String(draft.goal || "")}
                        onChange={(event) => setTaskDrafts((current) => ({ ...current, [task.id]: { ...draft, goal: event.target.value } }))}
                        className="mt-1 min-h-24 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">
                      Vragen
                      <textarea
                        value={draft.questionsText || ""}
                        onChange={(event) => setTaskDrafts((current) => ({ ...current, [task.id]: { ...draft, questionsText: event.target.value } }))}
                        className="mt-1 min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <label className="block text-sm font-medium text-gray-700">
                      Toegestane acties
                      <textarea
                        value={draft.actionsText || ""}
                        onChange={(event) => setTaskDrafts((current) => ({ ...current, [task.id]: { ...draft, actionsText: event.target.value } }))}
                        className="mt-1 min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </label>
                    <button
                      onClick={() => saveTask(task)}
                      disabled={busy === `agent-task-${task.id}`}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                      Taak opslaan
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
