"use client";

import { useEffect, useState, useCallback } from "react";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  MapPinIcon,
  PhoneIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notionPageId: string | null;
  mauticContactId: number | null;
  _count: {
    tasks: number;
    calls: number;
  };
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const statusTabs = [
  { key: "", label: "Alle" },
  { key: "lead", label: "Lead" },
  { key: "actief", label: "Actief" },
  { key: "afgerond", label: "Afgerond" },
  { key: "geannuleerd", label: "Geannuleerd" },
];

const statusColors: Record<string, string> = {
  lead: "bg-purple-100 text-purple-700 border-purple-200",
  actief: "bg-green-100 text-green-700 border-green-200",
  afgerond: "bg-gray-100 text-gray-600 border-gray-200",
  geannuleerd: "bg-red-100 text-red-700 border-red-200",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  actief: "Actief",
  afgerond: "Afgerond",
  geannuleerd: "Geannuleerd",
};

export default function ProjectenPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Nieuw project modal
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProject, setNewProject] = useState({
    name: "",
    description: "",
    status: "lead",
    address: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
  });

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "24");
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    try {
      const response = await fetch(`/api/projecten?${params}`);
      const data = await response.json();
      setProjects(data.projects || []);
      setPagination(data.pagination || null);
    } catch {
      console.error("Fout bij ophalen projecten");
    }
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/projecten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });

      if (response.ok) {
        setShowNew(false);
        setNewProject({
          name: "",
          description: "",
          status: "lead",
          address: "",
          contactName: "",
          contactPhone: "",
          contactEmail: "",
        });
        fetchProjects();
      }
    } catch {
      console.error("Fout bij aanmaken project");
    }
    setSaving(false);
  }

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
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/projecten/${project.id}`}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                    <FolderIcon className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-primary">
                      {project.name}
                    </h3>
                    {project.address && (
                      <p className="flex items-center gap-1 text-xs text-gray-500">
                        <MapPinIcon className="h-3 w-3" />
                        {project.address}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    statusColors[project.status] || statusColors.lead
                  }`}
                >
                  {statusLabels[project.status] || project.status}
                </span>
              </div>

              {project.description && (
                <p className="mb-3 text-sm text-gray-500 line-clamp-2">
                  {project.description}
                </p>
              )}

              {/* Contact info */}
              {project.contactName && (
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
              )}

              {/* Statistieken */}
              <div className="flex items-center gap-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <ClipboardDocumentListIcon className="h-3.5 w-3.5" />
                  {project._count.tasks} taken
                </span>
                <span className="inline-flex items-center gap-1">
                  <PhoneIcon className="h-3.5 w-3.5" />
                  {project._count.calls} gesprekken
                </span>
              </div>
            </a>
          ))}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Nieuw project
              </h2>
              <button
                onClick={() => setShowNew(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate}>
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
                  placeholder="Bijv. Verkoop Dorpsstraat 12"
                />
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Omschrijving
                </label>
                <textarea
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Extra details over het project..."
                />
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={newProject.status}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, status: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="lead">Lead</option>
                    <option value="actief">Actief</option>
                    <option value="afgerond">Afgerond</option>
                    <option value="geannuleerd">Geannuleerd</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Adres
                  </label>
                  <input
                    type="text"
                    value={newProject.address}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, address: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Straat, plaats"
                  />
                </div>
              </div>

              <div className="mb-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                  Contactgegevens
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Naam
                    </label>
                    <input
                      type="text"
                      value={newProject.contactName}
                      onChange={(e) =>
                        setNewProject((p) => ({
                          ...p,
                          contactName: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Telefoon
                    </label>
                    <input
                      type="tel"
                      value={newProject.contactPhone}
                      onChange={(e) =>
                        setNewProject((p) => ({
                          ...p,
                          contactPhone: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={newProject.contactEmail}
                      onChange={(e) =>
                        setNewProject((p) => ({
                          ...p,
                          contactEmail: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
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
