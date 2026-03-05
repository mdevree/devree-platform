"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  EnvelopeIcon,
  PhoneIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  ArrowTopRightOnSquareIcon,
  LinkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface HypotheekAdviseur {
  id: string;
  naam: string;
  bedrijf: string | null;
}

interface Project {
  id: string;
  name: string;
  type: string;
  projectStatus: string | null;
  woningAdres: string | null;
}

interface LeadProject {
  id: string;
  addedAt: string;
  project: Project;
}

interface Lead {
  id: string;
  naam: string;
  email: string | null;
  telefoon: string | null;
  mauticContactId: string | null;
  status: string;
  notities: string | null;
  hypotheekAdviseur: HypotheekAdviseur | null;
  hypotheekAdviseurId: string | null;
  hypotheekAdviseurDatum: string | null;
  createdAt: string;
  _count?: { projecten: number };
}

interface LeadDetail extends Lead {
  projecten: LeadProject[];
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  KIJKER: "Kijker",
  ZOEKER: "Zoeker",
  CONVERTED: "Converted",
  INACTIEF: "Inactief",
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  KIJKER: "bg-gray-100 text-gray-600",
  ZOEKER: "bg-blue-100 text-blue-700",
  CONVERTED: "bg-green-100 text-green-700",
  INACTIEF: "bg-red-100 text-red-600",
};

const PROJECT_TYPE_COLORS: Record<string, string> = {
  VERKOOP: "bg-blue-100 text-blue-700",
  AANKOOP: "bg-green-100 text-green-700",
  TAXATIE: "bg-purple-100 text-purple-700",
};

const statusTabs = [
  { key: "", label: "Alle" },
  { key: "KIJKER", label: "Kijker" },
  { key: "ZOEKER", label: "Zoeker" },
  { key: "CONVERTED", label: "Converted" },
  { key: "INACTIEF", label: "Inactief" },
];

const PIPELINE_STEPS = ["KIJKER", "ZOEKER", "CONVERTED"];

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 24, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Nieuw modal
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({
    naam: "",
    email: "",
    telefoon: "",
    notities: "",
    status: "KIJKER",
    mauticContactId: "",
  });
  const [mauticSearch, setMauticSearch] = useState("");
  const [mauticResults, setMauticResults] = useState<{ id: number; firstname: string; lastname: string; email: string; phone: string }[]>([]);
  const [mauticSelected, setMauticSelected] = useState<{ id: number; naam: string } | null>(null);
  const [showMauticSection, setShowMauticSection] = useState(false);
  const mauticTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geselecteerde lead (sidepanel)
  const [selected, setSelected] = useState<LeadDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Projecten koppelen
  const [projectSearch, setProjectSearch] = useState("");
  const [projectResults, setProjectResults] = useState<Project[]>([]);
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const projectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hypotheekadviseur
  const [adviseurs, setAdviseurs] = useState<HypotheekAdviseur[]>([]);
  const [showAdviseurSection, setShowAdviseurSection] = useState(false);
  const [adviseurForm, setAdviseurForm] = useState({ hypotheekAdviseurId: "", hypotheekAdviseurDatum: "" });
  const [savingAdviseur, setSavingAdviseur] = useState(false);

  // Notities auto-save
  const [notities, setNotities] = useState("");
  const notitiesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("page", page.toString());
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads || []);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Laad adviseurs (voor dropdown)
  useEffect(() => {
    fetch("/api/hypotheekadviseurs?actief=true")
      .then((r) => r.json())
      .then((d) => setAdviseurs(d.adviseurs || []));
  }, []);

  const fetchDetail = async (id: string) => {
    setLoadingDetail(true);
    setShowProjectSearch(false);
    setShowAdviseurSection(false);
    setProjectSearch("");
    setProjectResults([]);
    try {
      const res = await fetch(`/api/leads/${id}`);
      const data = await res.json();
      setSelected(data.lead);
      setNotities(data.lead.notities || "");
      setAdviseurForm({
        hypotheekAdviseurId: data.lead.hypotheekAdviseurId || "",
        hypotheekAdviseurDatum: data.lead.hypotheekAdviseurDatum
          ? data.lead.hypotheekAdviseurDatum.split("T")[0]
          : "",
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  // Mautic contact zoeken (debounced)
  const handleMauticSearch = (q: string) => {
    setMauticSearch(q);
    if (mauticTimer.current) clearTimeout(mauticTimer.current);
    if (!q.trim()) { setMauticResults([]); return; }
    mauticTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/mautic/contacts?search=${encodeURIComponent(q)}&limit=10`);
      const data = await res.json();
      setMauticResults(data.contacts || []);
    }, 300);
  };

  const selectMauticContact = (c: { id: number; firstname: string; lastname: string; email: string; phone: string }) => {
    const naam = [c.firstname, c.lastname].filter(Boolean).join(" ");
    setMauticSelected({ id: c.id, naam });
    setNewForm((f) => ({
      ...f,
      naam: naam || f.naam,
      email: c.email || f.email,
      telefoon: c.phone || f.telefoon,
      mauticContactId: String(c.id),
    }));
    setMauticResults([]);
    setMauticSearch("");
  };

  const handleCreate = async () => {
    if (!newForm.naam.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naam: newForm.naam,
          email: newForm.email || null,
          telefoon: newForm.telefoon || null,
          mauticContactId: newForm.mauticContactId || null,
          status: newForm.status,
          notities: newForm.notities || null,
        }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewForm({ naam: "", email: "", telefoon: "", notities: "", status: "KIJKER", mauticContactId: "" });
        setMauticSelected(null);
        setMauticSearch("");
        fetchLeads();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selected) return;
    const res = await fetch(`/api/leads/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setSelected((s) => s ? { ...s, status: data.lead.status } : s);
      fetchLeads();
    }
  };

  // Projecten zoeken (debounced)
  const handleProjectSearch = (q: string) => {
    setProjectSearch(q);
    if (projectTimer.current) clearTimeout(projectTimer.current);
    if (!q.trim()) { setProjectResults([]); return; }
    projectTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/projecten?search=${encodeURIComponent(q)}&limit=10`);
      const data = await res.json();
      setProjectResults(data.projects || []);
    }, 300);
  };

  const handleLinkProject = async (project: Project) => {
    if (!selected) return;
    const res = await fetch(`/api/leads/${selected.id}/projecten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    if (res.ok) {
      setShowProjectSearch(false);
      setProjectSearch("");
      setProjectResults([]);
      fetchDetail(selected.id);
      fetchLeads();
    }
  };

  const handleUnlinkProject = async (projectId: string) => {
    if (!selected) return;
    const res = await fetch(`/api/leads/${selected.id}/projecten`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (res.ok) {
      fetchDetail(selected.id);
      fetchLeads();
    }
  };

  const handleSaveAdviseur = async () => {
    if (!selected) return;
    setSavingAdviseur(true);
    try {
      const res = await fetch(`/api/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hypotheekAdviseurId: adviseurForm.hypotheekAdviseurId || null,
          hypotheekAdviseurDatum: adviseurForm.hypotheekAdviseurDatum || null,
        }),
      });
      if (res.ok) {
        setShowAdviseurSection(false);
        fetchDetail(selected.id);
        fetchLeads();
      }
    } finally {
      setSavingAdviseur(false);
    }
  };

  const handleNotitiesBlur = () => {
    if (!selected || notities === (selected.notities || "")) return;
    if (notitiesTimer.current) clearTimeout(notitiesTimer.current);
    notitiesTimer.current = setTimeout(async () => {
      await fetch(`/api/leads/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notities: notities || null }),
      });
      setSelected((s) => s ? { ...s, notities } : s);
    }, 300);
  };

  const handleDeleteLead = async () => {
    if (!selected) return;
    if (!confirm(`Weet je zeker dat je ${selected.naam} wilt verwijderen?`)) return;
    const res = await fetch(`/api/leads/${selected.id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected(null);
      fetchLeads();
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kijkers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pipeline van kijkers naar klanten
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <PlusIcon className="h-4 w-4" />
          Nieuwe kijker
        </button>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Zoekbalk */}
      <div className="mb-6 max-w-md">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoek op naam, e-mail of telefoon..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Kaartgrid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Laden...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {search || statusFilter ? "Geen resultaten gevonden." : "Nog geen kijkers toegevoegd."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => fetchDetail(lead.id)}
                className="cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
                      <UserGroupIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{lead.naam}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-600"}`}>
                    {LEAD_STATUS_LABELS[lead.status] || lead.status}
                  </span>
                </div>

                <div className="mt-3 space-y-1">
                  {lead.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <EnvelopeIcon className="h-3.5 w-3.5" />
                      {lead.email}
                    </div>
                  )}
                  {lead.telefoon && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <PhoneIcon className="h-3.5 w-3.5" />
                      {lead.telefoon}
                    </div>
                  )}
                  {lead.hypotheekAdviseur && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <BuildingOfficeIcon className="h-3.5 w-3.5" />
                      Doorverwezen: {lead.hypotheekAdviseur.naam}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
                  <span>{lead._count?.projecten ?? 0} gekoppeld project{(lead._count?.projecten ?? 0) !== 1 ? "en" : ""}</span>
                  <span>{new Date(lead.createdAt).toLocaleDateString("nl-NL")}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Paginering */}
          {pagination.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                Vorige
              </button>
              <span className="text-sm text-gray-600">
                Pagina {page} van {pagination.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                Volgende
              </button>
            </div>
          )}
        </>
      )}

      {/* Sidepanel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/30"
            onClick={() => setSelected(null)}
          />
          <div className="w-full max-w-md overflow-y-auto bg-white shadow-xl">
            {loadingDetail ? (
              <div className="flex h-full items-center justify-center text-gray-400">Laden...</div>
            ) : (
              <>
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">{selected.naam}</h2>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEAD_STATUS_COLORS[selected.status] || "bg-gray-100 text-gray-600"}`}>
                      {LEAD_STATUS_LABELS[selected.status] || selected.status}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Contactgegevens */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Contactgegevens</h3>
                    <div className="space-y-2 text-sm text-gray-600">
                      {selected.email && (
                        <div className="flex items-center gap-2">
                          <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                          <a href={`mailto:${selected.email}`} className="hover:text-primary">{selected.email}</a>
                        </div>
                      )}
                      {selected.telefoon && (
                        <div className="flex items-center gap-2">
                          <PhoneIcon className="h-4 w-4 text-gray-400" />
                          <a href={`tel:${selected.telefoon}`} className="hover:text-primary">{selected.telefoon}</a>
                        </div>
                      )}
                      {selected.mauticContactId && (
                        <a
                          href={`https://connect.devreemakelaardij.nl/s/contacts/view/${selected.mauticContactId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-primary hover:underline"
                        >
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                          Open in Mautic
                        </a>
                      )}
                      {!selected.email && !selected.telefoon && (
                        <p className="text-xs text-gray-400">Geen contactgegevens</p>
                      )}
                    </div>
                  </div>

                  {/* Pipeline visualizer */}
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-gray-900">Pipeline</h3>
                    <div className="flex items-center gap-0">
                      {PIPELINE_STEPS.map((step, idx) => {
                        const isActive = selected.status === step;
                        const isPast = PIPELINE_STEPS.indexOf(selected.status) > idx;
                        return (
                          <div key={step} className="flex flex-1 items-center">
                            <button
                              onClick={() => handleUpdateStatus(step)}
                              className={`flex flex-1 flex-col items-center rounded-lg py-2 text-xs font-medium transition-colors ${
                                isActive
                                  ? "bg-primary text-white"
                                  : isPast
                                  ? "bg-primary/20 text-primary"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                            >
                              {LEAD_STATUS_LABELS[step]}
                            </button>
                            {idx < PIPELINE_STEPS.length - 1 && (
                              <div className={`h-0.5 w-2 ${isPast || isActive ? "bg-primary/40" : "bg-gray-200"}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selected.status === "INACTIEF" ? (
                      <button
                        onClick={() => handleUpdateStatus("KIJKER")}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        Heractiveer als Kijker
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus("INACTIEF")}
                        className="mt-2 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
                      >
                        Markeer als inactief
                      </button>
                    )}
                  </div>

                  {/* Gekoppelde projecten */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">
                        Gekoppelde projecten ({selected.projecten?.length ?? 0})
                      </h3>
                      <button
                        onClick={() => setShowProjectSearch(!showProjectSearch)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Koppel project
                      </button>
                    </div>

                    {showProjectSearch && (
                      <div className="mb-3">
                        <div className="relative">
                          <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Zoek project..."
                            value={projectSearch}
                            onChange={(e) => handleProjectSearch(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
                            autoFocus
                          />
                        </div>
                        {projectResults.length > 0 && (
                          <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-sm">
                            {projectResults.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleLinkProject(p)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                              >
                                <span className="text-gray-800">{p.name}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs ${PROJECT_TYPE_COLORS[p.type] || "bg-gray-100 text-gray-600"}`}>
                                  {p.type}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {selected.projecten && selected.projecten.length > 0 ? (
                      <div className="space-y-2">
                        {selected.projecten.map((lp) => (
                          <div key={lp.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                            <a
                              href={`/projecten/${lp.project.id}`}
                              className="flex-1 text-sm text-gray-800 hover:text-primary"
                            >
                              <span className="font-medium">{lp.project.name}</span>
                              {lp.project.woningAdres && (
                                <span className="ml-1 text-xs text-gray-500">— {lp.project.woningAdres}</span>
                              )}
                            </a>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs ${PROJECT_TYPE_COLORS[lp.project.type] || "bg-gray-100 text-gray-600"}`}>
                                {lp.project.type}
                              </span>
                              <button
                                onClick={() => handleUnlinkProject(lp.project.id)}
                                className="rounded p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-500"
                                title="Ontkoppel"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Geen gekoppelde projecten</p>
                    )}
                  </div>

                  {/* Hypotheekadviseur */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Hypotheekadviseur</h3>
                    {selected.hypotheekAdviseur && !showAdviseurSection ? (
                      <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                        <div>
                          <div className="flex items-center gap-2 text-sm">
                            <BuildingOfficeIcon className="h-4 w-4 text-amber-600" />
                            <span className="font-medium text-gray-800">{selected.hypotheekAdviseur.naam}</span>
                          </div>
                          {selected.hypotheekAdviseur.bedrijf && (
                            <p className="ml-6 text-xs text-gray-500">{selected.hypotheekAdviseur.bedrijf}</p>
                          )}
                          {selected.hypotheekAdviseurDatum && (
                            <p className="ml-6 text-xs text-gray-400">
                              Doorverwezen op {new Date(selected.hypotheekAdviseurDatum).toLocaleDateString("nl-NL")}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setShowAdviseurSection(true)}
                          className="text-xs text-primary hover:underline"
                        >
                          Wijzigen
                        </button>
                      </div>
                    ) : showAdviseurSection ? (
                      <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Hypotheekadviseur</label>
                          <div className="relative">
                            <select
                              value={adviseurForm.hypotheekAdviseurId}
                              onChange={(e) => setAdviseurForm((f) => ({ ...f, hypotheekAdviseurId: e.target.value }))}
                              className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none"
                            >
                              <option value="">— Geen adviseur —</option>
                              {adviseurs.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.naam}{a.bedrijf ? ` (${a.bedrijf})` : ""}
                                </option>
                              ))}
                            </select>
                            <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Doorverwijsdatum</label>
                          <input
                            type="date"
                            value={adviseurForm.hypotheekAdviseurDatum}
                            onChange={(e) => setAdviseurForm((f) => ({ ...f, hypotheekAdviseurDatum: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveAdviseur}
                            disabled={savingAdviseur}
                            className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                          >
                            {savingAdviseur ? "Opslaan..." : "Opslaan"}
                          </button>
                          <button
                            onClick={() => setShowAdviseurSection(false)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Annuleren
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAdviseurSection(true)}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 w-full"
                      >
                        <BuildingOfficeIcon className="h-4 w-4" />
                        Stuur door naar hypotheekadviseur
                      </button>
                    )}
                  </div>

                  {/* Notities */}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Notities</h3>
                    <textarea
                      value={notities}
                      onChange={(e) => setNotities(e.target.value)}
                      onBlur={handleNotitiesBlur}
                      rows={4}
                      placeholder="Notities over deze kijker..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
                    />
                  </div>

                  {/* Verwijderen */}
                  <div className="border-t border-gray-200 pt-4">
                    <button
                      onClick={handleDeleteLead}
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Verwijder kijker
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: Nieuwe kijker */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nieuwe kijker</h2>
              <button onClick={() => setShowNew(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
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

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
                <div className="flex gap-2">
                  {["KIJKER", "ZOEKER"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewForm({ ...newForm, status: s })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        newForm.status === s
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {LEAD_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notities</label>
                <textarea
                  value={newForm.notities}
                  onChange={(e) => setNewForm({ ...newForm, notities: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              {/* Mautic koppeling */}
              <div className="rounded-lg border border-gray-200">
                <button
                  onClick={() => setShowMauticSection(!showMauticSection)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-600"
                >
                  <span className="font-medium">Mautic contact koppelen</span>
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${showMauticSection ? "rotate-180" : ""}`} />
                </button>
                {showMauticSection && (
                  <div className="border-t border-gray-100 px-3 pb-3 pt-2">
                    {mauticSelected ? (
                      <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
                        <span className="text-sm text-blue-800">{mauticSelected.naam}</span>
                        <button
                          onClick={() => {
                            setMauticSelected(null);
                            setNewForm((f) => ({ ...f, mauticContactId: "" }));
                          }}
                          className="text-blue-400 hover:text-blue-600"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative mb-2">
                          <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={mauticSearch}
                            onChange={(e) => handleMauticSearch(e.target.value)}
                            placeholder="Zoek op naam of e-mail..."
                            className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                        {mauticResults.length > 0 && (
                          <div className="rounded-lg border border-gray-200 bg-white">
                            {mauticResults.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => selectMauticContact(c)}
                                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-gray-50"
                              >
                                <span className="font-medium text-gray-800">
                                  {[c.firstname, c.lastname].filter(Boolean).join(" ") || "Onbekend"}
                                </span>
                                <span className="text-xs text-gray-500">{c.email || c.phone}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
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
