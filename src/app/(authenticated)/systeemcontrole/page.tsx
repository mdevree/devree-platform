"use client";

import { useEffect, useMemo, useState } from "react";

type SyncHealth = {
  health: "ok" | "attention";
  since: string;
  eventCounts24h: Record<string, number>;
  quarantineCounts: Record<string, number>;
  queues: Record<string, Record<string, number>>;
  latestEvents: Array<{
    id: string;
    eventType: string;
    status: string;
    ignoredReason?: string | null;
    email?: string | null;
    rcode?: string | null;
    systemid?: string | null;
    extensionVersion?: string | null;
    createdAt: string;
  }>;
  latestQuarantine: Array<{
    id: string;
    reason: string;
    severity: string;
    eventType?: string | null;
    email?: string | null;
    rcode?: string | null;
    systemid?: string | null;
    extensionVersion?: string | null;
    createdAt: string;
  }>;
  latestBackupCapture?: { source?: string | null; url?: string | null; receivedAt?: string | null } | null;
};

type DataQuality = {
  summary: Record<string, number>;
  duplicateEmails: Array<{ key: string; count: number; rows: Array<{ id: string; naam: string; email?: string | null }> }>;
  duplicateMauticContactIds: Array<{ key: string; count: number; rows: Array<{ id: string; naam: string; mauticContactId?: string | null }> }>;
  agendaIssues: Array<{
    id: string;
    systemid: number;
    agdescr?: string | null;
    agbegin?: string | null;
    agrcode?: string | null;
    contactNaam?: string | null;
    enrichmentStatus?: string | null;
  }>;
  openQuarantine: Array<{
    id: string;
    reason: string;
    severity: string;
    email?: string | null;
    rcode?: string | null;
    systemid?: string | null;
    createdAt: string;
  }>;
};

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "good" | "warn" }) {
  const toneClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function countTotal(values?: Record<string, number>) {
  return Object.values(values || {}).reduce((sum, value) => sum + value, 0);
}

export default function SysteemcontrolePage() {
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [quality, setQuality] = useState<DataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [healthRes, qualityRes] = await Promise.all([
        fetch("/api/system/health/sync"),
        fetch("/api/system/data-quality/contacts"),
      ]);
      if (!healthRes.ok || !qualityRes.ok) throw new Error("Systeemcontrole kon niet worden geladen");
      setHealth(await healthRes.json());
      setQuality(await qualityRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const queueTotals = useMemo(() => {
    if (!health) return { pending: 0, failed: 0 };
    return Object.values(health.queues).reduce((acc, queue) => ({
      pending: acc.pending + (queue.pending || 0),
      failed: acc.failed + (queue.failed || 0),
    }), { pending: 0, failed: 0 });
  }, [health]);

  if (loading) return <div className="py-12 text-center text-gray-400">Systeemcontrole laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Systeemcontrole</h1>
          <p className="mt-1 text-sm text-gray-500">
            Realworks-extensie, sync-events, quarantaine en datakwaliteit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); load(); }}
          className="border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Vernieuwen
        </button>
      </div>

      {error && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Syncstatus" value={health?.health === "ok" ? "OK" : "Aandacht"} tone={health?.health === "ok" ? "good" : "warn"} />
        <Stat label="Events 24 uur" value={countTotal(health?.eventCounts24h)} />
        <Stat label="Open quarantaine" value={health?.quarantineCounts?.open || 0} tone={(health?.quarantineCounts?.open || 0) > 0 ? "warn" : "good"} />
        <Stat label="Queue pending" value={queueTotals.pending} tone={queueTotals.pending > 0 ? "warn" : "good"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Open quarantaine</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {(health?.latestQuarantine || []).length === 0 && (
              <p className="px-4 py-6 text-sm text-gray-500">Geen open verdachte payloads.</p>
            )}
            {(health?.latestQuarantine || []).map((item) => (
              <div key={item.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-900">{item.eventType || "payload"} · {item.severity}</p>
                  <span className="text-xs text-gray-500">{fmtDate(item.createdAt)}</span>
                </div>
                <p className="mt-1 text-gray-600">{item.reason}</p>
                <p className="mt-1 text-xs text-gray-400">{[item.email, item.rcode, item.systemid].filter(Boolean).join(" · ") || "geen sleutel"}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Laatste sync-events</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {(health?.latestEvents || []).map((event) => (
              <div key={event.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-900">{event.eventType} · {event.status}</p>
                  <span className="text-xs text-gray-500">{fmtDate(event.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{[event.email, event.rcode, event.systemid, event.extensionVersion].filter(Boolean).join(" · ") || "-"}</p>
                {event.ignoredReason && <p className="mt-1 text-gray-600">{event.ignoredReason}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Datakwaliteit</h2>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-5">
          <Stat label="Dubbele e-mails" value={quality?.summary.duplicateEmailGroups || 0} tone={(quality?.summary.duplicateEmailGroups || 0) > 0 ? "warn" : "good"} />
          <Stat label="Dubbele Mautic IDs" value={quality?.summary.duplicateMauticContactIdGroups || 0} tone={(quality?.summary.duplicateMauticContactIdGroups || 0) > 0 ? "warn" : "good"} />
          <Stat label="Zonder contactinfo" value={quality?.summary.missingContactInfo || 0} />
          <Stat label="Agenda issues" value={quality?.summary.agendaIssues || 0} tone={(quality?.summary.agendaIssues || 0) > 0 ? "warn" : "good"} />
          <Stat label="Verdachte sync" value={quality?.summary.suspiciousSyncEvents || 0} tone={(quality?.summary.suspiciousSyncEvents || 0) > 0 ? "warn" : "good"} />
        </div>
        <div className="grid gap-6 border-t border-gray-100 p-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Agenda-koppelingen met aandacht</h3>
            <div className="space-y-2">
              {(quality?.agendaIssues || []).slice(0, 8).map((item) => (
                <div key={item.id} className="border border-gray-100 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">{item.agdescr || "Afspraak"} · {item.enrichmentStatus}</p>
                  <p className="text-xs text-gray-500">{fmtDate(item.agbegin)} · rcode {item.agrcode || "-"}</p>
                </div>
              ))}
              {(quality?.agendaIssues || []).length === 0 && <p className="text-sm text-gray-500">Geen open agenda-issues.</p>}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Dubbele e-mailgroepen</h3>
            <div className="space-y-2">
              {(quality?.duplicateEmails || []).slice(0, 8).map((group) => (
                <div key={group.key} className="border border-gray-100 px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">{group.key} · {group.count} leads</p>
                  <p className="text-xs text-gray-500">{group.rows.map((row) => row.naam).join(", ")}</p>
                </div>
              ))}
              {(quality?.duplicateEmails || []).length === 0 && <p className="text-sm text-gray-500">Geen dubbele e-mailgroepen.</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
