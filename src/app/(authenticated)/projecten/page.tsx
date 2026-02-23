"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  HomeModernIcon,
  MapPinIcon,
  PhoneIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  XMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  STATUS_FLOW,
  STATUS_LABELS,
  STATUS_COLORS,
  VERKOOPMETHODE_LABELS,
  VERKOOPSTART_LABELS,
} from "@/lib/projectTypes";

interface Project {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string; // legacy
  projectStatus: string | null; // nieuw
  address: string | null;
  woningAdres: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notionPageId: string | null;
  mauticContactId: number | null;
  realworksId: string | null;
  contacts?: { id: string; mauticContactId: number; role: string }[];
  _count: {
    tasks: number;
    calls: number;
  };
  calls: { id: string; _count: { notes: number } }[];
  totalTimeSpent: number;
  createdAt: string;
}

function formatProjectTime(seconds: number): string {
  if (seconds === 0) return null as unknown as string;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}u ${m}m`;
  if (h > 0) return `${h}u`;
  return `${m}m`;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const typeTabs = [
  { key: "", label: "Alle" },
  { key: "VERKOOP", label: "Verkoop" },
  { key: "AANKOOP", label: "Aankoop" },
  { key: "TAXATIE", label: "Taxatie" },
];

const statusTabs = [
  { key: "", label: "Alle" },
  { key: "lead", label: "Lead", statusGroup: "lead" },
  { key: "actief", label: "Actief", statusGroup: "active" },
  { key: "afgerond", label: "Afgerond/Geannuleerd", statusGroup: "terminal" },
];

function getProjectStatus(project: Project): string {
  return project.projectStatus || project.status;
}

function getStatusLabel(project: Project): string {
  const s = project.projectStatus;
  if (s && STATUS_LABELS[s]) return STATUS_LABELS[s];
  // legacy
  const legacyMap: Record<string, string> = {
    lead: "Lead",
    actief: "Actief",
    afgerond: "Afgerond",
    geannuleerd: "Geannuleerd",
  };
  return legacyMap[project.status] || project.status;
}

function getStatusColor(project: Project): string {
  const s = project.projectStatus;
  if (s && STATUS_COLORS[s]) return STATUS_COLORS[s];
  const legacyMap: Record<string, string> = {
    lead: "bg-gray-100 text-gray-600",
    actief: "bg-green-100 text-green-700",
    afgerond: "bg-gray-100 text-gray-600",
    geannuleerd: "bg-red-100 text-red-600",
  };
  return legacyMap[project.status] || "bg-gray-100 text-gray-600";
}

function getDisplayAddress(project: Project): string | null {
  if (project.woningAdres) {
    const parts = [project.woningAdres];
    return parts.join(", ");
  }
  return project.address;
}

export default function ProjectenPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("actief");
  const [page, setPage] = useState(1);

  const [woningFotos, setWoningFotos] = useState<Record<string, string | null>>({});

  // Standaardinstellingen uit API
  const [defaults, setDefaults] = useState<Record<string, Record<string, unknown>>>({});

  // Nieuw project modal
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showWoningSection, setShowWoningSection] = useState(false);
  const [showCommercieelSection, setShowCommercieelSection] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    type: "VERKOOP",
    projectStatus: "LEAD",
    verkoopstart: "DIRECT",
    startdatum: "",
    startReden: "",
    address: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    woningAdres: "",
    woningPostcode: "",
    woningPlaats: "",
    courtagePercentage: "",
    vraagprijs: "",
    bijzondereAfspraken: "",
    verkoopmethode: "",
    kostenPubliciteit: "",
    kostenEnergielabel: "",
    kostenIntrekking: "",
    kostenBedenktijd: "",
  });

  // Haal standaardinstellingen op
  useEffect(() => {
    fetch("/api/instellingen")
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setDefaults(d as Record<string, Record<string, unknown>>))
      .catch(() => {});
  }, []);

  // Pas defaults toe als type wijzigt
  const applyDefaults = useCallback((type: string) => {
    const d = defaults[`defaults_${type}`];
    if (!d) return;
    setNewProject((p) => ({
      ...p,
      courtagePercentage: d.courtagePercentage as string || p.courtagePercentage,
      verkoopmethode: d.verkoopmethode as string || p.verkoopmethode,
      kostenPubliciteit: d.kostenPubliciteit != null ? String(d.kostenPubliciteit) : p.kostenPubliciteit,
      kostenEnergielabel: d.kostenEnergielabel != null ? String(d.kostenEnergielabel) : p.kostenEnergielabel,
      kostenIntrekking: d.kostenIntrekking != null ? String(d.kostenIntrekking) : p.kostenIntrekking,
      kostenBedenktijd: d.kostenBedenktijd != null ? String(d.kostenBedenktijd) : p.kostenBedenktijd,
    }));
  }, [defaults]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "24");
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);

    const activeTab = statusTabs.find((t) => t.key === statusFilter);
    if (activeTab?.statusGroup) {
      params.set("statusGroup", activeTab.statusGroup);
    }

    try {
      const response = await fetch(`/api/projecten?${params}`);
      const data = await response.json();
      const loaded: Project[] = data.projects || [];
      setProjects(loaded);
      setPagination(data.pagination || null);

      const metRealworks = loaded.filter((p) => p.realworksId);
      metRealworks.forEach(async (p) => {
        const id = p.realworksId!;
        setWoningFotos((prev) => {
          if (id in prev) return prev;
          fetch(`/api/wordpress/woning?realworksId=${encodeURIComponent(id)}`)
            .then((r) => r.ok ? r.json() : null)
            .then((woning) => {
              setWoningFotos((cache) => ({
                ...cache,
                [id]: woning?.featuredImage ?? null,
              }));
            })
            .catch(() => {
              setWoningFotos((cache) => ({ ...cache, [id]: null }));
            });
          return { ...prev, [id]: null };
        });
      });
    } catch {
      console.error("Fout bij ophalen projecten");
    }
    setLoading(false);
  }, [page, search, typeFilter, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function resetNewProject() {
    setNewProject({
      name: "",
      description: "",
      type: "VERKOOP",
      projectStatus: "LEAD",
      verkoopstart: "DIRECT",
      startdatum: "",
      startReden: "",
      address: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      woningAdres: "",
      woningPostcode: "",
      woningPlaats: "",
      courtagePercentage: "",
      vraagprijs: "",
      bijzondereAfspraken: "",
      verkoopmethode: "",
      kostenPubliciteit: "",
      kostenEnergielabel: "",
      kostenIntrekking: "",
      kostenBedenktijd: "",
    });
    setShowWoningSection(false);
    setShowCommercieelSection(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...newProject,
        status: "lead", // legacy
        vraagprijs: newProject.vraagprijs ? parseFloat(newProject.vraagprijs) : null,
        kostenPubliciteit: newProject.kostenPubliciteit ? parseInt(newProject.kostenPubliciteit) : null,
        kostenEnergielabel: newProject.kostenEnergielabel ? parseInt(newProject.kostenEnergielabel) : null,
        kostenIntrekking: newProject.kostenIntrekking ? parseInt(newProject.kostenIntrekking) : null,
        kostenBedenktijd: newProject.kostenBedenktijd ? parseInt(newProject.kostenBedenktijd) : null,
        verkoopstart: newProject.type === "VERKOOP" ? newProject.verkoopstart : null,
        startdatum: newProject.verkoopstart === "UITGESTELD" && newProject.startdatum ? newProject.startdatum : null,
        startReden: newProject.verkoopstart === "SLAPEND" ? newProject.startReden : null,
      };

      const response = await fetch("/api/projecten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setShowNew(false);
        resetNewProject();
        fetchProjects();
      }
    } catch {
      console.error("Fout bij aanmaken project");
    }
    setSaving(false);
  }

  const availableStatuses = STATUS_FLOW[newProject.type] || STATUS_FLOW.VERKOOP;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projecten</h1>
          <p className="mt-1 text-sm text-gray-500">
            Beheer projectdossiers en opdrachten
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <PlusIcon className="h-4 w-4" />
          Nieuw project
        </button>
      </div>

      {/* Type tabs */}
      <div className="mb-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {typeTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setTypeFilter(tab.key);
              setPage(1);
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              typeFilter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.key && (
              <span className={`ml-1.5 inline-flex h-2 w-2 rounded-full ${
                tab.key === "VERKOOP" ? "bg-blue-400" :
                tab.key === "AANKOOP" ? "bg-green-400" :
                "bg-purple-400"
              }`} />
            )}
          </button>
        ))}
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStatusFilter(tab.key);
              setPage(1);
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Zoekbalk */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoek op naam, adres of contact..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Project kaarten grid */}
      {loading ? (
        <div className="py-12 text-center text-gray-500">Laden...</div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center">
          <FolderIcon className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">Geen projecten gevonden</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const displayAddress = getDisplayAddress(project);
            const statusLabel = getStatusLabel(project);
            const statusColor = getStatusColor(project);
            const effectiveType = project.type || "VERKOOP";

            return (
              <a
                key={project.id}
                href={`/projecten/${project.id}`}
                className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                {/* Foto of placeholder */}
                {project.realworksId && woningFotos[project.realworksId] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={woningFotos[project.realworksId]!}
                    alt={project.name}
                    className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className={`flex h-14 items-center gap-3 px-5 pt-5`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${project.realworksId ? "bg-amber-50" : "bg-gray-50"}`}>
                      {project.realworksId ? (
                        <HomeModernIcon className="h-5 w-5 text-amber-500" />
                      ) : (
                        <FolderIcon className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                )}

                <div className="p-5">
                  {/* Naam + status badges */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-gray-900 group-hover:text-primary">
                        {project.name}
                      </h3>
                      {displayAddress && (
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPinIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{displayAddress}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {/* Type badge */}
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${PROJECT_TYPE_COLORS[effectiveType] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                        {PROJECT_TYPE_LABELS[effectiveType] || effectiveType}
                      </span>
                      {/* Status badge */}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>

                  {project.description && (
                    <p className="mb-3 text-sm text-gray-500 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  {/* Contact info */}
                  {project.contacts && project.contacts.length > 0 ? (
                    <div className="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {project.contacts.length}
                      </span>
                      <span className="font-medium text-gray-700">
                        {project.contacts.length === 1 ? "contact" : "contacten"}
                      </span>
                    </div>
                  ) : project.contactName ? (
                    <div className="mb-3 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">
                        {project.contactName}
                      </span>
                      {project.contactPhone && (
                        <span className="ml-2">
                          <PhoneIcon className="inline h-3 w-3" />{" "}
                          {project.contactPhone}
                        </span>
                      )}
                    </div>
                  ) : null}

                  {/* Statistieken */}
                  <div className="flex items-center gap-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <ClipboardDocumentListIcon className="h-3.5 w-3.5" />
                      {project._count.tasks} taken
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <PhoneIcon className="h-3.5 w-3.5" />
                      {project._count.calls} gesprekken
                      {project.calls?.some((c) => c._count.notes > 0) && (
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white" title="Gesprekken met notities">
                          {project.calls.reduce((sum, c) => sum + c._count.notes, 0)}
                        </span>
                      )}
                    </span>
                    {formatProjectTime(project.totalTimeSpent) && (
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {formatProjectTime(project.totalTimeSpent)}
                      </span>
                    )}
                    {project.realworksId && (
                      <span className="ml-auto inline-flex items-center gap-1 text-amber-600">
                        <HomeModernIcon className="h-3.5 w-3.5" />
                        Woning
                      </span>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Paginatie */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {pagination.total} projecten totaal
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Vorige
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600">
              Pagina {page} van {pagination.pages}
            </span>
            <button
              onClick={() =>
                setPage((p) => Math.min(pagination.pages, p + 1))
              }
              disabled={page >= pagination.pages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Volgende
            </button>
          </div>
        </div>
      )}

      {/* Nieuw project modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Nieuw project
              </h2>
              <button
                onClick={() => { setShowNew(false); resetNewProject(); }}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto px-6 py-4">
                {/* Type selector */}
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Type opdracht *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["VERKOOP", "AANKOOP", "TAXATIE"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setNewProject((p) => ({
                            ...p,
                            type: t,
                            projectStatus: "LEAD",
                            verkoopstart: "DIRECT",
                          }));
                          applyDefaults(t);
                        }}
                        className={`rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                          newProject.type === t
                            ? PROJECT_TYPE_COLORS[t]
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {PROJECT_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Naam */}
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Projectnaam *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProject.name}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder={`Bijv. ${newProject.type === "VERKOOP" ? "Verkoop" : newProject.type === "AANKOOP" ? "Aankoop" : "Taxatie"} Dorpsstraat 12`}
                  />
                </div>

                {/* Status */}
                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Beginstatus
                  </label>
                  <select
                    value={newProject.projectStatus}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, projectStatus: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    {availableStatuses.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                    ))}
                  </select>
                </div>

                {/* Verkoopstart — alleen bij VERKOOP */}
                {newProject.type === "VERKOOP" && (
                  <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <p className="mb-2 text-xs font-medium text-blue-700">Verkoopstart</p>
                    <div className="flex gap-2">
                      {(["DIRECT", "UITGESTELD", "SLAPEND"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setNewProject((p) => ({ ...p, verkoopstart: v }))}
                          className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                            newProject.verkoopstart === v
                              ? "border-blue-400 bg-blue-600 text-white"
                              : "border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
                          }`}
                        >
                          {VERKOOPSTART_LABELS[v].split(" ")[0]}
                        </button>
                      ))}
                    </div>
                    {newProject.verkoopstart === "UITGESTELD" && (
                      <div className="mt-2">
                        <label className="mb-1 block text-xs font-medium text-blue-700">Startdatum</label>
                        <input
                          type="date"
                          value={newProject.startdatum}
                          onChange={(e) => setNewProject((p) => ({ ...p, startdatum: e.target.value }))}
                          className="w-full rounded-lg border border-blue-200 px-3 py-1.5 text-sm focus:outline-none"
                        />
                      </div>
                    )}
                    {newProject.verkoopstart === "SLAPEND" && (
                      <div className="mt-2">
                        <label className="mb-1 block text-xs font-medium text-blue-700">Reden (optioneel)</label>
                        <input
                          type="text"
                          value={newProject.startReden}
                          onChange={(e) => setNewProject((p) => ({ ...p, startReden: e.target.value }))}
                          placeholder="Bijv. wacht op aankoop andere woning"
                          className="w-full rounded-lg border border-blue-200 px-3 py-1.5 text-sm focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Omschrijving */}
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Omschrijving
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, description: e.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Extra details..."
                  />
                </div>

                {/* Contactgegevens */}
                <div className="mb-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                    Contactgegevens (optioneel)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Naam</label>
                      <input
                        type="text"
                        value={newProject.contactName}
                        onChange={(e) => setNewProject((p) => ({ ...p, contactName: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">Telefoon</label>
                      <input
                        type="tel"
                        value={newProject.contactPhone}
                        onChange={(e) => setNewProject((p) => ({ ...p, contactPhone: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">E-mail</label>
                      <input
                        type="email"
                        value={newProject.contactEmail}
                        onChange={(e) => setNewProject((p) => ({ ...p, contactEmail: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Woning sectie uitklapper */}
                <button
                  type="button"
                  onClick={() => setShowWoningSection((v) => !v)}
                  className="mb-2 flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Woninggegevens
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${showWoningSection ? "rotate-180" : ""}`} />
                </button>
                {showWoningSection && (
                  <div className="mb-3 rounded-lg border border-gray-100 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Adres</label>
                        <input
                          type="text"
                          value={newProject.woningAdres}
                          onChange={(e) => setNewProject((p) => ({ ...p, woningAdres: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          placeholder="Straatnaam + huisnummer"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Postcode</label>
                        <input
                          type="text"
                          value={newProject.woningPostcode}
                          onChange={(e) => setNewProject((p) => ({ ...p, woningPostcode: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Plaats</label>
                        <input
                          type="text"
                          value={newProject.woningPlaats}
                          onChange={(e) => setNewProject((p) => ({ ...p, woningPlaats: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Commercieel sectie uitklapper */}
                <button
                  type="button"
                  onClick={() => setShowCommercieelSection((v) => !v)}
                  className="mb-2 flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Commerciële afspraken & kosten
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${showCommercieelSection ? "rotate-180" : ""}`} />
                </button>
                {showCommercieelSection && (
                  <div className="mb-3 rounded-lg border border-gray-100 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          {newProject.type === "AANKOOP" ? "Aankoopbudget (€)" : newProject.type === "TAXATIE" ? "Taxatiewaarde (€)" : "Vraagprijs (€)"}
                        </label>
                        <input
                          type="number"
                          value={newProject.vraagprijs}
                          onChange={(e) => setNewProject((p) => ({ ...p, vraagprijs: e.target.value }))}
                          placeholder="Bijv. 350000"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Courtage %</label>
                        <input
                          type="text"
                          value={newProject.courtagePercentage}
                          onChange={(e) => setNewProject((p) => ({ ...p, courtagePercentage: e.target.value }))}
                          placeholder="Bijv. 1.2"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                      {newProject.type === "VERKOOP" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Verkoopmethode</label>
                          <select
                            value={newProject.verkoopmethode}
                            onChange={(e) => setNewProject((p) => ({ ...p, verkoopmethode: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                          >
                            <option value="">— kies —</option>
                            {Object.entries(VERKOOPMETHODE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {newProject.type === "VERKOOP" && (
                        <>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Publiciteitskosten (€)</label>
                            <input
                              type="number"
                              value={newProject.kostenPubliciteit}
                              onChange={(e) => setNewProject((p) => ({ ...p, kostenPubliciteit: e.target.value }))}
                              placeholder="650"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Energielabel (€)</label>
                            <input
                              type="number"
                              value={newProject.kostenEnergielabel}
                              onChange={(e) => setNewProject((p) => ({ ...p, kostenEnergielabel: e.target.value }))}
                              placeholder="350"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Intrekkingskosten (€)</label>
                            <input
                              type="number"
                              value={newProject.kostenIntrekking}
                              onChange={(e) => setNewProject((p) => ({ ...p, kostenIntrekking: e.target.value }))}
                              placeholder="600"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Bedenktijdkosten (€)</label>
                            <input
                              type="number"
                              value={newProject.kostenBedenktijd}
                              onChange={(e) => setNewProject((p) => ({ ...p, kostenBedenktijd: e.target.value }))}
                              placeholder="350"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                            />
                          </div>
                        </>
                      )}
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Bijzondere afspraken</label>
                        <textarea
                          value={newProject.bijzondereAfspraken}
                          onChange={(e) => setNewProject((p) => ({ ...p, bijzondereAfspraken: e.target.value }))}
                          rows={2}
                          placeholder="Optionele aantekeningen..."
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => { setShowNew(false); resetNewProject(); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {saving ? "Opslaan..." : "Project aanmaken"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
