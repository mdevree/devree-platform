"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  FireIcon,
  NoSymbolIcon,
  PhoneIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

type ActionOpportunity = {
  id: string;
  status: string;
  priority: string;
  title: string;
  reason: string;
  suggestedAction: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  mauticContactId: number | null;
  realworksSearcherId: string | null;
  exchangeObjectId: string | null;
  objectAddress: string | null;
  objectCity: string | null;
  objectPrice: number | null;
  draftStatus: string | null;
  draftChannel: string | null;
  draftText: string | null;
  taskId: string | null;
  createdAt: string;
  pickedUpAt: string | null;
};

type ApiResponse = {
  opportunities: ActionOpportunity[];
  counts: Record<string, number>;
};

const filters = [
  { key: "open", label: "Nieuw" },
  { key: "picked_up", label: "Opgepakt" },
  { key: "dismissed", label: "Afgewezen" },
  { key: "all", label: "Alles" },
];

const priorityStyle: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 ring-red-100",
  high: "bg-orange-50 text-orange-700 ring-orange-100",
  normal: "bg-blue-50 text-blue-700 ring-blue-100",
  low: "bg-gray-50 text-gray-600 ring-gray-100",
};

function money(value: number | null) {
  if (!value) return null;
  return `€ ${value.toLocaleString("nl-NL")}`;
}

function priorityLabel(priority: string) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "Hoog";
  if (priority === "low") return "Laag";
  return "Normaal";
}

function telHref(phone: string | null) {
  return phone ? `tel:${phone}` : null;
}

export default function KansenBoard() {
  const [status, setStatus] = useState("open");
  const [data, setData] = useState<ApiResponse>({ opportunities: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(nextStatus = status) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kansen/actions?status=${nextStatus}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kon kansen niet laden");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon kansen niet laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const totals = useMemo(() => {
    const open = data.counts.open || 0;
    const picked = data.counts.picked_up || 0;
    return { open, picked };
  }, [data.counts]);

  async function recalculate() {
    setBusyId("recalculate");
    setError(null);
    try {
      const res = await fetch("/api/kansen/recalculate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kon kansen niet verversen");
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon kansen niet verversen");
    } finally {
      setBusyId(null);
    }
  }

  async function pickup(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/kansen/actions/${id}/pickup`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kon kans niet oppakken");
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon kans niet oppakken");
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/kansen/actions/${id}/dismiss`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kon kans niet afwijzen");
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon kans niet afwijzen");
    } finally {
      setBusyId(null);
    }
  }

  async function requestDraft(id: string, channel: "email" | "whatsapp") {
    setBusyId(`${id}-${channel}`);
    setError(null);
    try {
      const res = await fetch(`/api/kansen/actions/${id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kon concept niet aanvragen");
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kon concept niet aanvragen");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <FireIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Kansen</h1>
              <p className="mt-1 text-sm text-gray-500">
                Concrete opvolgkansen met aanleiding, object en volgende stap.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={recalculate}
          disabled={busyId === "recalculate"}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${busyId === "recalculate" ? "animate-spin" : ""}`} />
          Verversen
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Nieuw</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{totals.open}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Opgepakt</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{totals.picked}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatus(filter.key)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              status === filter.key
                ? "bg-primary text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Kansen laden...
        </div>
      ) : data.opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center">
          <CheckCircleIcon className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-700">Geen kansen in deze selectie</p>
          <p className="mt-1 text-sm text-gray-400">
            Nieuwe Realworks matches verschijnen hier zodra mutaties en zoekersdata samenkomen.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Kandidaat</th>
                <th className="px-4 py-3">Object</th>
                <th className="px-4 py-3">Waarom benaderen</th>
                <th className="px-4 py-3">Prioriteit</th>
                <th className="px-4 py-3 text-right">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.opportunities.map((item) => {
                const tel = telHref(item.contactPhone);
                return (
                  <tr key={item.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                          <UserCircleIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {item.contactName || "Onbekende zoeker"}
                          </p>
                          <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                            {item.contactEmail && <p>{item.contactEmail}</p>}
                            {item.contactPhone && <p>{item.contactPhone}</p>}
                            {item.realworksSearcherId && <p>Zoeker {item.realworksSearcherId}</p>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-gray-900">
                        {item.objectAddress || "Object uit Realworks"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {[item.objectCity, money(item.objectPrice)].filter(Boolean).join(" - ")}
                      </p>
                      {item.exchangeObjectId && (
                        <p className="mt-1 text-xs text-gray-400">Exchange {item.exchangeObjectId}</p>
                      )}
                    </td>
                    <td className="max-w-xl px-4 py-4">
                      <p className="whitespace-pre-line text-gray-700">{item.reason}</p>
                      {item.suggestedAction && (
                        <p className="mt-2 text-xs font-medium text-gray-500">
                          Volgende stap: {item.suggestedAction}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                          priorityStyle[item.priority] || priorityStyle.normal
                        }`}
                      >
                        {priorityLabel(item.priority)}
                      </span>
                      <p className="mt-2 text-xs text-gray-400">
                        {new Date(item.createdAt).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex flex-col items-end gap-2">
                        {item.status === "open" && (
                          <button
                            type="button"
                            onClick={() => pickup(item.id)}
                            disabled={busyId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                          >
                            <ClipboardDocumentCheckIcon className="h-4 w-4" />
                            Oppakken
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => requestDraft(item.id, "email")}
                          disabled={busyId === `${item.id}-email`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Concept e-mail
                        </button>
                        {item.status === "open" && (
                          <button
                            type="button"
                            onClick={() => dismiss(item.id)}
                            disabled={busyId === item.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100 disabled:opacity-50"
                          >
                            <NoSymbolIcon className="h-4 w-4" />
                            Afwijzen
                          </button>
                        )}
                        {tel && (
                          <a
                            href={tel}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
                          >
                            <PhoneIcon className="h-4 w-4" />
                            Bel
                          </a>
                        )}
                        {item.mauticContactId && (
                          <a
                            href={`${MAUTIC_URL}/s/contacts/view/${item.mauticContactId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary"
                          >
                            Mautic
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {item.taskId && (
                          <span className="text-xs font-medium text-emerald-600">Taak aangemaakt</span>
                        )}
                        {item.draftStatus && (
                          <span className="text-xs font-medium text-blue-600">
                            Concept {item.draftStatus === "ready" ? "klaar" : "aangevraagd"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
