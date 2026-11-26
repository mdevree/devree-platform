"use client";

import { ArrowLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { whatsappDraftLoginPath, whatsappDraftPath } from "@/lib/whatsappDraftLinks";
import WhatsAppPushSettings, { clearDraftNotifications, syncDraftNotifications } from "./WhatsAppPushSettings";

type Account = "office" | "personal";
type Draft = {
  id: string;
  account: Account;
  kind: "reply" | "followup";
  recipientName: string;
  summary: string;
  body: string | null;
  state: "open" | "answered" | "sent" | "uncertain" | "closed";
  version: string;
  canEdit: boolean;
  canSend: boolean;
  updatedAt: string;
  messages: { body: string; at: string }[];
};
type DraftResponse = {
  draft?: Draft;
  drafts?: Draft[];
  personalAvailable?: boolean;
  complete?: boolean;
  error?: string;
};

const endpoint = "/api/mobile/whatsapp-concepten";
const accountNames: Record<Account, string> = { office: "Kantoor", personal: "Persoonlijk" };
const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});

async function requestDrafts(id?: string, init?: RequestInit) {
  const url = id ? `${endpoint}?draft=${encodeURIComponent(id)}` : endpoint;
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 401) {
    window.location.replace(whatsappDraftLoginPath(id));
    throw new Error("Je sessie is verlopen.");
  }
  const result: DraftResponse = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, result };
}

function Badge({ draft }: { draft: Draft }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
      <span className={`rounded-full px-2 py-1 font-semibold ${
        draft.account === "office" ? "bg-primary/10 text-primary" : "bg-emerald-50 text-emerald-800"
      }`}>
        {accountNames[draft.account]}
      </span>
      <span>{draft.kind === "reply" ? "Antwoord" : "Opvolging"}</span>
    </span>
  );
}

function statusText(draft: Draft) {
  if (draft.state === "answered") return "Al beantwoord";
  if (draft.state === "sent") return "Verstuurd";
  if (draft.state === "uncertain") return "Verzending wordt gecontroleerd";
  return "Dit concept staat niet meer open.";
}

export default function WhatsAppDrafts({ draftId }: { draftId?: string }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [personalAvailable, setPersonalAvailable] = useState(false);
  const [filter, setFilter] = useState<"all" | Account>("all");
  const [edit, setEdit] = useState<{ text: string; version: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const fetchVersion = useRef(0);
  const mutating = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (document.visibilityState !== "visible" || mutating.current) return;
      const requestVersion = ++fetchVersion.current;
      const readStartedAt = Date.now();
      try {
        const response = await requestDrafts(draftId, { signal: controller.signal });
        if (controller.signal.aborted || requestVersion !== fetchVersion.current) return;
        if (!response.ok) {
          if (draftId && response.status === 404) {
            clearDraftNotifications([draftId]);
            setDraft(null);
            setLoadError("Dit concept is niet meer beschikbaar.");
            return;
          }
          throw new Error(response.result.error ?? "WhatsApp-concepten konden niet worden geladen.");
        }

        setLoadError("");
        if (response.result.draft) {
          const next = response.result.draft;
          setDraft(next);
          if (next.state !== "open") clearDraftNotifications([next.id]);
        } else if (response.result.drafts) {
          const items = response.result.drafts;
          setDrafts(items);
          setPersonalAvailable(Boolean(response.result.personalAvailable));
          if (response.result.complete) {
            const activeIds = items.filter((item) => item.state === "open").map((item) => item.id);
            syncDraftNotifications(activeIds, readStartedAt);
          }
        }
      } catch (failure) {
        if (!controller.signal.aborted && requestVersion === fetchVersion.current) {
          setLoadError((failure as Error).message);
        }
      }
    }

    void load();
    const timer = window.setInterval(load, 4_000);
    document.addEventListener("visibilitychange", load, { signal: controller.signal });
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [draftId, refresh]);

  const text = edit?.text ?? draft?.body ?? "";
  const isNewVersion = Boolean(edit && draft && edit.version !== draft.version);

  async function persist(action: "save" | "send") {
    if (!draftId || !draft || mutating.current || isNewVersion || !text.trim()) return;
    mutating.current = true;
    fetchVersion.current += 1;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await requestDrafts(draftId, {
        method: action === "save" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id, version: draft.version, body: text }),
      });
      if (response.result.draft) {
        setDraft(response.result.draft);
        if (response.result.draft.state !== "open") clearDraftNotifications([draft.id]);
      }
      if (!response.ok) {
        setError(response.result.error ?? "De wijziging kon niet worden verwerkt.");
        setRefresh((count) => count + 1);
        return;
      }
      if (action === "send" && response.result.draft?.state === "open") {
        setError("Het bericht is niet verstuurd. Controleer het concept voordat je opnieuw probeert.");
        return;
      }
      setEdit(null);
      if (action === "save") setNotice("Concept opgeslagen.");
    } catch (failure) {
      setError((failure as Error).message);
      setRefresh((count) => count + 1);
    } finally {
      mutating.current = false;
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-5 sm:px-6 sm:pt-8">
      {draftId ? (
        <>
          <Link
            href={whatsappDraftPath()}
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary focus-visible:outline-2"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Alle WhatsApp-concepten
          </Link>
          {draft ? (
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
              <div className="space-y-2">
                <Badge draft={draft} />
                <h1 className="break-words text-xl font-semibold text-gray-950">{draft.recipientName}</h1>
                {draft.summary && <p className="break-words text-sm text-gray-700">{draft.summary}</p>}
              </div>
              {draft.state === "open" ? (
                <div className="space-y-3">
                  <label htmlFor="whatsapp-draft-body" className="block text-sm font-semibold">Conceptbericht</label>
                  <textarea
                    id="whatsapp-draft-body"
                    className="block min-h-36 w-full rounded-lg border border-gray-300 p-3 text-base leading-relaxed focus:outline-2 focus:outline-primary disabled:bg-gray-50"
                    value={text}
                    disabled={Boolean(busy) || !draft.canEdit}
                    maxLength={10000}
                    onChange={(event) => {
                      const nextText = event.target.value;
                      setEdit((current) => ({ text: nextText, version: current?.version ?? draft.version }));
                      setNotice("");
                    }}
                  />
                  {isNewVersion && (
                    <aside className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                      <p role="status">
                        {draft.kind === "reply"
                          ? "Er is iets gewijzigd in dit gesprek. Bekijk de appjes hieronder. Jouw tekst is bewaard."
                          : "Dit concept is intussen bijgewerkt. Je kunt jouw tekst behouden of de opgeslagen versie laden."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="min-h-11 rounded-md border border-amber-400 px-3 font-semibold"
                          onClick={() => setEdit({ text, version: draft.version })}
                        >
                          Mijn tekst behouden
                        </button>
                        <button
                          type="button"
                          className="min-h-11 rounded-md px-3 underline"
                          onClick={() => setEdit(null)}
                        >
                          Nieuwste versie tonen
                        </button>
                      </div>
                    </aside>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => persist("save")}
                      disabled={Boolean(busy) || !draft.canEdit || isNewVersion || !edit || !text.trim()}
                      className="min-h-11 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      {busy === "save" ? "Opslaan…" : "Wijziging opslaan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => persist("send")}
                      disabled={Boolean(busy) || !draft.canSend || isNewVersion || !text.trim()}
                      className="min-h-11 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy === "send" ? "Versturen…" : draft.account === "office" ? "Verstuur vanaf kantoor" : "Verstuur vanaf mijn nummer"}
                    </button>
                  </div>
                  {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
                  {draft.kind === "reply" && draft.messages.length > 0 && (
                    <section className="space-y-2 border-t border-gray-100 pt-4">
                      <h2 className="text-sm font-semibold">Ontvangen appjes</h2>
                      {draft.messages.map((message, index) => (
                        <div key={`${message.at}-${index}`} className="rounded-lg bg-gray-50 p-3">
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                          <p className="mt-1 text-xs text-gray-600">{dateFormatter.format(new Date(message.at))}</p>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              ) : (
                <p role="status" className="rounded-lg bg-gray-50 p-3 font-medium">{statusText(draft)}</p>
              )}
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            </section>
          ) : !loadError && <p role="status" className="text-sm text-gray-600">Concept laden…</p>}
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-gray-950">WhatsApp-concepten</h1>
          {personalAvailable && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="WhatsApp-account">
              {(["all", "office", "personal"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={filter === option}
                  className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                    filter === option ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-800"
                  }`}
                  onClick={() => setFilter(option)}
                >
                  {option === "all" ? "Alles" : accountNames[option]}
                </button>
              ))}
            </div>
          )}
          {drafts ? (
            <DraftList drafts={drafts.filter((item) => !personalAvailable || filter === "all" || filter === item.account)} />
          ) : !loadError && <p role="status" className="text-sm text-gray-600">Concepten laden…</p>}
          {drafts && <WhatsAppPushSettings personalAvailable={personalAvailable} />}
        </>
      )}
      {loadError && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="status">
          <p>{loadError}</p>
          <button type="button" className="min-h-11 font-semibold underline" onClick={() => setRefresh((count) => count + 1)}>
            Opnieuw laden
          </button>
        </div>
      )}
    </main>
  );
}

function DraftList({ drafts }: { drafts: Draft[] }) {
  if (!drafts.length) return <p className="text-sm text-gray-600">Er staan geen concepten klaar.</p>;
  return (
    <ul className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {drafts.map((draft) => (
        <li key={draft.id} className="border-b border-gray-100 last:border-b-0">
          <Link
            href={whatsappDraftPath(draft.id)}
            prefetch={false}
            className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50 focus-visible:bg-gray-50"
          >
            <div className="min-w-0 space-y-1">
              <Badge draft={draft} />
              <p className="break-words font-semibold text-gray-950">{draft.recipientName}</p>
              {draft.summary && <p className="break-words text-sm text-gray-700">{draft.summary}</p>}
              {draft.state === "uncertain" && <p className="text-sm text-amber-950">{statusText(draft)}</p>}
            </div>
            <ChevronRightIcon className="size-5 shrink-0 text-gray-500" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
