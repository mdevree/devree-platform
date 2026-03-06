"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  PhoneIcon,
  XMarkIcon,
  UserGroupIcon,
  ClipboardDocumentCheckIcon,
  PencilIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

/* ── Types ─────────────────────────────────────────────────── */

interface HypotheekAdviseur {
  id: string;
  naam: string;
  bedrijf: string | null;
  email: string | null;
  telefoon: string | null;
  notities: string | null;
  actief: boolean;
  createdAt: string;
  _count: {
    leads: number;
    projecten: number;
    vveGesprekken: number;
  };
}

interface AdviseurLead {
  id: string;
  naam: string;
  status: string;
  hypotheekAfgesloten: boolean;
  createdAt: string;
}

interface AdviseurProject {
  id: string;
  name: string;
  type: string;
  projectStatus: string | null;
  createdAt: string;
}

interface VveGesprek {
  id: string;
  datum: string;
  naam: string;
  omschrijving: string | null;
  createdAt: string;
}

interface AdviseurDetail extends HypotheekAdviseur {
  leads: AdviseurLead[];
  projecten: AdviseurProject[];
  vveGesprekken: VveGesprek[];
}

interface AdviseurStats {
  leads: { total: number; converted: number; hypotheekAfgesloten: number };
  taxaties: { total: number; afgerond: number };
  vveGesprekken: { total: number };
  periodeLabel: string;
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  KIJKER: "Kijker",
  ZOEKER: "Zoeker",
  CONVERTED: "Converted",
  INACTIEF: "Inactief",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  KIJKER: "bg-blue-100 text-blue-700",
  ZOEKER: "bg-amber-100 text-amber-700",
  CONVERTED: "bg-green-100 text-green-700",
  INACTIEF: "bg-gray-100 text-gray-500",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  AFGEROND: "bg-green-100 text-green-700",
  ACTIEF: "bg-blue-100 text-blue-700",
  GEANNULEERD: "bg-red-100 text-red-700",
};

type TabKey = "overzicht" | "kijkers" | "taxaties" | "vve";
type Periode = "maand" | "kwartaal" | "jaar" | "alles";

/* ── Component ─────────────────────────────────────────────── */

export default function SamenwerkingenPage() {
  const [adviseurs, setAdviseurs] = useState<HypotheekAdviseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactief, setShowInactief] = useState(false);

  // Nieuw modal
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({
    naam: "",
    bedrijf: "",
    email: "",
    telefoon: "",
    notities: "",
  });

  // Geselecteerde adviseur (sidepanel)
  const [selected, setSelected] = useState<AdviseurDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Bewerken
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    naam: "",
    bedrijf: "",
    email: "",
    telefoon: "",
    notities: "",
  });

  // Tabs + stats
  const [activeTab, setActiveTab] = useState<TabKey>("overzicht");
  const [stats, setStats] = useState<AdviseurStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [periode, setPeriode] = useState<Periode>("alles");

  // VVE gesprekken
  const [showVveForm, setShowVveForm] = useState(false);
  const [vveForm, setVveForm] = useState({ naam: "", datum: "", omschrijving: "" });
  const [savingVve, setSavingVve] = useState(false);
  const [vveGesprekken, setVveGesprekken] = useState<VveGesprek[]>([]);

  /* ── Data fetching ───────────────────────────────────────── */

  const fetchAdviseurs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!showInactief) params.set("actief", "true");
      const res = await fetch(`/api/hypotheekadviseurs?${params}`);
      const data = await res.json();
      setAdviseurs(data.adviseurs || []);
    } finally {
      setLoading(false);
    }
  }, [showInactief]);

  useEffect(() => {
    fetchAdviseurs();
  }, [fetchAdviseurs]);

  const fetchStats = useCallback(async (adviseurId: string, p: Periode) => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/hypotheekadviseurs/${adviseurId}/stats?periode=${p}`);
      const data = await res.json();
      setStats(data);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchVveGesprekken = useCallback(async (adviseurId: string) => {
    const res = await fetch(`/api/hypotheekadviseurs/${adviseurId}/vve-gesprekken`);
    const data = await res.json();
    setVveGesprekken(data.gesprekken || []);
  }, []);

  const fetchDetail = async (id: string) => {
    setLoadingDetail(true);
    setActiveTab("overzicht");
    try {
      const res = await fetch(`/api/hypotheekadviseurs/${id}`);
      const data = await res.json();
      setSelected(data.adviseur);
      setEditForm({
        naam: data.adviseur.naam,
        bedrijf: data.adviseur.bedrijf || "",
        email: data.adviseur.email || "",
        telefoon: data.adviseur.telefoon || "",
        notities: data.adviseur.notities || "",
      });
      // Fetch stats + vve in parallel
      fetchStats(id, periode);
      fetchVveGesprekken(id);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Re-fetch stats when periode changes
  useEffect(() => {
    if (selected) {
      fetchStats(selected.id, periode);
    }
  }, [periode, selected, fetchStats]);

  /* ── Handlers ────────────────────────────────────────────── */

  const handleCreate = async () => {
    if (!newForm.naam.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/hypotheekadviseurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      if (res.ok) {
        setShowNew(false);
        setNewForm({ naam: "", bedrijf: "", email: "", telefoon: "", notities: "" });
        fetchAdviseurs();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selected || !editForm.naam.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/hypotheekadviseurs/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditing(false);
        fetchDetail(selected.id);
        fetchAdviseurs();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeactiveer = async () => {
    if (!selected) return;
    if (!confirm(`Weet je zeker dat je ${selected.naam} wilt deactiveren?`)) return;
    const res = await fetch(`/api/hypotheekadviseurs/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actief: false }),
    });
    if (res.ok) {
      setSelected(null);
      fetchAdviseurs();
    }
  };

  const handleActiveer = async () => {
    if (!selected) return;
    const res = await fetch(`/api/hypotheekadviseurs/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actief: true }),
    });
    if (res.ok) {
      fetchDetail(selected.id);
      fetchAdviseurs();
    }
  };

  const handleToggleHypotheekAfgesloten = async (leadId: string, current: boolean) => {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypotheekAfgesloten: !current }),
    });
    if (res.ok && selected) {
      // Refresh detail + stats
      fetchDetail(selected.id);
    }
  };

  const handleCreateVve = async () => {
    if (!selected || !vveForm.naam.trim() || !vveForm.datum) return;
    setSavingVve(true);
    try {
      const res = await fetch(`/api/hypotheekadviseurs/${selected.id}/vve-gesprekken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vveForm),
      });
      if (res.ok) {
        setShowVveForm(false);
        setVveForm({ naam: "", datum: "", omschrijving: "" });
        fetchVveGesprekken(selected.id);
        fetchStats(selected.id, periode);
        fetchAdviseurs(); // update card count
      }
    } finally {
      setSavingVve(false);
    }
  };

  /* ── Filter ──────────────────────────────────────────────── */

  const filtered = adviseurs.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.naam.toLowerCase().includes(q) ||
      (a.bedrijf?.toLowerCase().includes(q) ?? false) ||
      (a.email?.toLowerCase().includes(q) ?? false)
    );
  });

  /* ── Helpers ─────────────────────────────────────────────── */

  const conversionPct =
    stats && stats.leads.total > 0
      ? Math.round((stats.leads.hypotheekAfgesloten / stats.leads.total) * 100)
      : 0;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overzicht", label: "Overzicht" },
    { key: "kijkers", label: "Kijkers" },
    { key: "taxaties", label: "Taxaties" },
    { key: "vve", label: "VVE Gesprekken" },
  ];

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Samenwerkingen</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hypotheekadviseurs en samenwerkingspartners
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <PlusIcon className="h-4 w-4" />
          Nieuwe partner
        </button>
      </div>

      {/* Zoekbalk + filter */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoek op naam, bedrijf of e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactief}
            onChange={(e) => setShowInactief(e.target.checked)}
            className="rounded border-gray-300"
          />
          Toon inactieven
        </label>
      </div>

      {/* Kaartgrid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Laden...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {search ? "Geen resultaten gevonden." : "Nog geen samenwerkingspartners toegevoegd."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <div
              key={a.id}
              onClick={() => { setEditing(false); fetchDetail(a.id); }}
              className={`cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                !a.actief ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                    <BuildingOfficeIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{a.naam}</p>
                    {a.bedrijf && (
                      <p className="text-xs text-gray-500">{a.bedrijf}</p>
                    )}
                  </div>
                </div>
                {!a.actief && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    Inactief
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-1">
                {a.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <EnvelopeIcon className="h-3.5 w-3.5" />
                    {a.email}
                  </div>
                )}
                {a.telefoon && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <PhoneIcon className="h-3.5 w-3.5" />
                    {a.telefoon}
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <UserGroupIcon className="h-3.5 w-3.5" />
                  {a._count.leads} kijker{a._count.leads !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <ClipboardDocumentCheckIcon className="h-3.5 w-3.5" />
                  {a._count.projecten} taxatie{a._count.projecten !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
                  {a._count.vveGesprekken} VVE
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sidepanel ────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/30"
            onClick={() => { setSelected(null); setEditing(false); }}
          />
          <div className="w-full max-w-lg overflow-y-auto bg-white shadow-xl">
            {loadingDetail ? (
              <div className="flex h-full items-center justify-center text-gray-400">
                Laden...
              </div>
            ) : (
              <>
                {/* Header sidepanel */}
                <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between px-6 py-4">
                    <div>
                      <h2 className="font-semibold text-gray-900">{selected.naam}</h2>
                      {selected.bedrijf && (
                        <p className="text-sm text-gray-500">{selected.bedrijf}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(!editing)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Bewerken"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setSelected(null); setEditing(false); }}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Contactgegevens (altijd zichtbaar) */}
                  <div className="px-6 pb-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      {selected.email && (
                        <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 hover:text-primary">
                          <EnvelopeIcon className="h-3.5 w-3.5 text-gray-400" />
                          {selected.email}
                        </a>
                      )}
                      {selected.telefoon && (
                        <a href={`tel:${selected.telefoon}`} className="flex items-center gap-1.5 hover:text-primary">
                          <PhoneIcon className="h-3.5 w-3.5 text-gray-400" />
                          {selected.telefoon}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Tab bar */}
                  {!editing && (
                    <div className="flex border-t border-gray-100 px-6">
                      {tabs.map((t) => (
                        <button
                          key={t.key}
                          onClick={() => setActiveTab(t.key)}
                          className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                            activeTab === t.key
                              ? "border-primary text-primary"
                              : "border-transparent text-gray-500 hover:text-gray-700"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  {/* ── Bewerken ─────────────────────────────── */}
                  {editing ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-gray-900">Gegevens bewerken</h3>
                      {[
                        { key: "naam", label: "Naam *", type: "text" },
                        { key: "bedrijf", label: "Bedrijf", type: "text" },
                        { key: "email", label: "E-mail", type: "email" },
                        { key: "telefoon", label: "Telefoon", type: "tel" },
                      ].map(({ key, label, type }) => (
                        <div key={key}>
                          <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                          <input
                            type={type}
                            value={editForm[key as keyof typeof editForm]}
                            onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Notities</label>
                        <textarea
                          value={editForm.notities}
                          onChange={(e) => setEditForm({ ...editForm, notities: e.target.value })}
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleEdit}
                          disabled={saving}
                          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          {saving ? "Opslaan..." : "Opslaan"}
                        </button>
                        <button
                          onClick={() => setEditing(false)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                        >
                          Annuleren
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* ── TAB: Overzicht ────────────────────── */}
                      {activeTab === "overzicht" && (
                        <div className="space-y-5">
                          {/* Periode selector */}
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900">Statistieken</h3>
                            <select
                              value={periode}
                              onChange={(e) => setPeriode(e.target.value as Periode)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                            >
                              <option value="maand">Deze maand</option>
                              <option value="kwartaal">Dit kwartaal</option>
                              <option value="jaar">Dit jaar</option>
                              <option value="alles">Alles</option>
                            </select>
                          </div>

                          {/* Stats kaarten */}
                          {loadingStats ? (
                            <div className="text-center py-4 text-gray-400 text-sm">Laden...</div>
                          ) : stats ? (
                            <>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg bg-blue-50 p-3 text-center">
                                  <p className="text-2xl font-bold text-blue-700">{stats.leads.total}</p>
                                  <p className="text-xs text-blue-600">Doorverwezen kijkers</p>
                                </div>
                                <div className="rounded-lg bg-green-50 p-3 text-center">
                                  <p className="text-2xl font-bold text-green-700">{stats.leads.hypotheekAfgesloten}</p>
                                  <p className="text-xs text-green-600">Hypotheek afgesloten</p>
                                </div>
                                <div className="rounded-lg bg-purple-50 p-3 text-center">
                                  <p className="text-2xl font-bold text-purple-700">{stats.taxaties.total}</p>
                                  <p className="text-xs text-purple-600">Taxaties</p>
                                </div>
                                <div className="rounded-lg bg-amber-50 p-3 text-center">
                                  <p className="text-2xl font-bold text-amber-700">{stats.vveGesprekken.total}</p>
                                  <p className="text-xs text-amber-600">VVE gesprekken</p>
                                </div>
                              </div>

                              {/* Conversie bar */}
                              {stats.leads.total > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-gray-700">Conversiepercentage</span>
                                    <span className="text-xs font-bold text-gray-900">{conversionPct}%</span>
                                  </div>
                                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                                    <div
                                      className="h-full rounded-full bg-green-500 transition-all duration-500"
                                      style={{ width: `${conversionPct}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {stats.leads.hypotheekAfgesloten} van {stats.leads.total} kijkers heeft hypotheek afgesloten
                                  </p>
                                </div>
                              )}
                            </>
                          ) : null}

                          {/* Notities */}
                          {selected.notities && (
                            <div>
                              <h3 className="mb-2 text-sm font-semibold text-gray-900">Notities</h3>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selected.notities}</p>
                            </div>
                          )}

                          {/* Acties */}
                          <div className="border-t border-gray-200 pt-4">
                            {selected.actief ? (
                              <button
                                onClick={handleDeactiveer}
                                className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              >
                                Deactiveer partner
                              </button>
                            ) : (
                              <button
                                onClick={handleActiveer}
                                className="w-full rounded-lg border border-green-200 px-3 py-2 text-sm text-green-600 hover:bg-green-50"
                              >
                                Activeer partner
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── TAB: Kijkers ──────────────────────── */}
                      {activeTab === "kijkers" && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Doorverwezen kijkers ({selected._count.leads})
                          </h3>
                          {selected.leads && selected.leads.length > 0 ? (
                            <div className="space-y-2">
                              {selected.leads.map((l) => (
                                <div key={l.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-sm font-medium text-gray-800 truncate">{l.naam}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_COLORS[l.status] || "bg-gray-100 text-gray-500"}`}>
                                      {LEAD_STATUS_LABELS[l.status] || l.status}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleToggleHypotheekAfgesloten(l.id, l.hypotheekAfgesloten)}
                                    className={`shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                      l.hypotheekAfgesloten
                                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                    title={l.hypotheekAfgesloten ? "Hypotheek afgesloten" : "Hypotheek niet afgesloten — klik om te wijzigen"}
                                  >
                                    <CheckCircleIcon className="h-3.5 w-3.5" />
                                    {l.hypotheekAfgesloten ? "Afgesloten" : "Niet afgesloten"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">Geen kijkers doorverwezen.</p>
                          )}
                        </div>
                      )}

                      {/* ── TAB: Taxaties ─────────────────────── */}
                      {activeTab === "taxaties" && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Taxatieopdrachten ({selected._count.projecten})
                          </h3>
                          {selected.projecten && selected.projecten.length > 0 ? (
                            <div className="space-y-2">
                              {selected.projecten.map((p) => (
                                <a
                                  key={p.id}
                                  href={`/projecten/${p.id}`}
                                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors"
                                >
                                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_STATUS_COLORS[p.projectStatus || ""] || "bg-gray-100 text-gray-500"}`}>
                                    {p.projectStatus || "Onbekend"}
                                  </span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">Geen taxatieopdrachten.</p>
                          )}
                        </div>
                      )}

                      {/* ── TAB: VVE Gesprekken ───────────────── */}
                      {activeTab === "vve" && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900">
                              VVE Gesprekken ({vveGesprekken.length})
                            </h3>
                            <button
                              onClick={() => setShowVveForm(!showVveForm)}
                              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                            >
                              <PlusIcon className="h-3.5 w-3.5" />
                              Nieuw gesprek
                            </button>
                          </div>

                          {/* Inline form */}
                          {showVveForm && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Naam / onderwerp *</label>
                                <input
                                  type="text"
                                  value={vveForm.naam}
                                  onChange={(e) => setVveForm({ ...vveForm, naam: e.target.value })}
                                  placeholder="Bijv. VVE Parklaan 5"
                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                                  autoFocus
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Datum *</label>
                                <input
                                  type="date"
                                  value={vveForm.datum}
                                  onChange={(e) => setVveForm({ ...vveForm, datum: e.target.value })}
                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Omschrijving</label>
                                <textarea
                                  value={vveForm.omschrijving}
                                  onChange={(e) => setVveForm({ ...vveForm, omschrijving: e.target.value })}
                                  rows={2}
                                  placeholder="Korte samenvatting van het gesprek..."
                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCreateVve}
                                  disabled={savingVve || !vveForm.naam.trim() || !vveForm.datum}
                                  className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                                >
                                  {savingVve ? "Opslaan..." : "Opslaan"}
                                </button>
                                <button
                                  onClick={() => { setShowVveForm(false); setVveForm({ naam: "", datum: "", omschrijving: "" }); }}
                                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                                >
                                  Annuleren
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Gesprekken lijst */}
                          {vveGesprekken.length > 0 ? (
                            <div className="space-y-2">
                              {vveGesprekken.map((g) => (
                                <div key={g.id} className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-800">{g.naam}</span>
                                    <span className="text-xs text-amber-600">
                                      {new Date(g.datum).toLocaleDateString("nl-NL", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                  {g.omschrijving && (
                                    <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{g.omschrijving}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400">Nog geen VVE gesprekken vastgelegd.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Nieuwe partner ────────────────────────────── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nieuwe samenwerkingspartner</h2>
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Naam *</label>
                <input
                  type="text"
                  value={newForm.naam}
                  onChange={(e) => setNewForm({ ...newForm, naam: e.target.value })}
                  placeholder="Voornaam achternaam"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bedrijf</label>
                <input
                  type="text"
                  value={newForm.bedrijf}
                  onChange={(e) => setNewForm({ ...newForm, bedrijf: e.target.value })}
                  placeholder="Naam van het hypotheekadviesbureau"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={newForm.email}
                  onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefoon</label>
                <input
                  type="tel"
                  value={newForm.telefoon}
                  onChange={(e) => setNewForm({ ...newForm, telefoon: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notities</label>
                <textarea
                  value={newForm.notities}
                  onChange={(e) => setNewForm({ ...newForm, notities: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleCreate}
                disabled={saving || !newForm.naam.trim()}
                className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Aanmaken..." : "Aanmaken"}
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
