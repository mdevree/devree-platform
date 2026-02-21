"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  FolderIcon,
  PlusIcon,
  XMarkIcon,
  HomeIcon,
  PhoneIcon,
} from "@heroicons/react/24/outline";
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  PIPELINE_STAGES_VERKOOP,
  PIPELINE_STAGES_AANKOOP,
  PIPELINE_STAGES_TAXATIE,
} from "@/lib/projectTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineProject {
  id: string;
  name: string;
  type: string;
  projectStatus: string | null;
  status: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  realworksId: string | null;
  updatedAt: string;
  createdAt: string;
  contacts: { mauticContactId: number; role: string }[];
}

type ActiveType = "VERKOOP" | "AANKOOP" | "TAXATIE";

const STAGES: Record<ActiveType, string[]> = {
  VERKOOP: PIPELINE_STAGES_VERKOOP,
  AANKOOP: PIPELINE_STAGES_AANKOOP,
  TAXATIE: PIPELINE_STAGES_TAXATIE,
};

// ─── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onOpenPanel,
}: {
  project: PipelineProject;
  onOpenPanel: (p: PipelineProject) => void;
}) {
  const statusColor = STATUS_COLORS[project.projectStatus || ""] || "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow">
      <button
        onClick={() => onOpenPanel(project)}
        className="block w-full text-left"
      >
        <p className="truncate text-sm font-medium text-gray-900 hover:text-primary">
          {project.name}
        </p>
        {project.address && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
            <HomeIcon className="h-3 w-3 flex-shrink-0" />
            {project.address}
          </p>
        )}
        {project.contactName && (
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {project.contactName}
          </p>
        )}
      </button>
      <div className="mt-2 flex items-center justify-between">
        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${statusColor}`}>
          {STATUS_LABELS[project.projectStatus || ""] || project.projectStatus}
        </span>
        <span className="text-[10px] text-gray-400">
          {new Date(project.updatedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PipelineProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<ActiveType>("VERKOOP");
  const [selectedProject, setSelectedProject] = useState<PipelineProject | null>(null);

  // Nieuw project modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ActiveType>("VERKOOP");
  const [creating, setCreating] = useState(false);

  // Status update
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: activeType });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/projecten/pipeline?${params}`);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      console.error("Fout bij ophalen pipeline");
    }
    setLoading(false);
  }, [activeType, search]);

  useEffect(() => {
    fetchProjects();
    setSelectedProject(null);
  }, [fetchProjects]);

  const stages = STAGES[activeType];

  const byStage = stages.reduce((acc, stage) => {
    acc[stage] = projects.filter((p) => p.projectStatus === stage);
    return acc;
  }, {} as Record<string, PipelineProject[]>);

  // Projecten zonder status (bijv. legacy)
  const withoutStatus = projects.filter(
    (p) => !p.projectStatus || !stages.includes(p.projectStatus)
  );

  async function handleUpdateStatus(project: PipelineProject, newStatus: string) {
    if (newStatus === project.projectStatus) return;
    setStatusUpdating(true);
    setStatusMessage("");
    try {
      const res = await fetch(`/api/projecten/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectStatus: newStatus }),
      });
      const data = await res.json();
      if (data.success || data.project) {
        setStatusMessage("Status bijgewerkt");
        const updated = { ...project, projectStatus: newStatus };
        setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
        setSelectedProject(updated);
        setTimeout(() => setStatusMessage(""), 2000);
      } else {
        setStatusMessage("Fout bij bijwerken");
      }
    } catch {
      setStatusMessage("Netwerkfout");
    }
    setStatusUpdating(false);
  }

  function openCreate() {
    setNewName("");
    setNewType(activeType);
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/projecten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          type: newType,
          projectStatus: "LEAD",
          status: "lead",
        }),
      });
      const data = await res.json();
      if (data.success && data.project) {
        setShowCreate(false);
        router.push(`/projecten/${data.project.id}`);
      }
    } catch {
      console.error("Fout bij aanmaken project");
    }
    setCreating(false);
  }

  const totalByStage = stages.reduce((sum, s) => sum + (byStage[s]?.length || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalByStage} actieve projecten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProjects}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Vernieuwen
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <PlusIcon className="h-4 w-4" />
            Nieuw project
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {(["VERKOOP", "AANKOOP", "TAXATIE"] as ActiveType[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              activeType === t
                ? `${PROJECT_TYPE_COLORS[t]} shadow-sm`
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {PROJECT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Zoekbalk */}
      <div className="mb-4 relative max-w-xs">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek project of contact..."
          className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Pipeline laden...</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3" style={{ minWidth: `${stages.length * 220}px` }}>
            {stages.map((stage) => {
              const stageProjects = byStage[stage] || [];
              const colorClass = STATUS_COLORS[stage] || "bg-gray-100 text-gray-600 border-gray-200";
              // Kolom achtergrond: lichte variant van de badge kleur
              const bgClass = colorClass.includes("blue") ? "bg-blue-50 border-blue-200"
                : colorClass.includes("amber") ? "bg-amber-50 border-amber-200"
                : colorClass.includes("green") ? "bg-green-50 border-green-200"
                : colorClass.includes("purple") ? "bg-purple-50 border-purple-200"
                : colorClass.includes("red") ? "bg-red-50 border-red-200"
                : colorClass.includes("indigo") ? "bg-indigo-50 border-indigo-200"
                : "bg-gray-50 border-gray-200";

              return (
                <div key={stage} className={`w-52 flex-shrink-0 rounded-xl border p-3 ${bgClass}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700 truncate">
                      {STATUS_LABELS[stage] || stage}
                    </h3>
                    <span className="ml-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm">
                      {stageProjects.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {stageProjects.length === 0 && (
                      <p className="py-4 text-center text-xs text-gray-400">Leeg</p>
                    )}
                    {stageProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onOpenPanel={setSelectedProject}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Kolom voor projecten zonder geldige status */}
            {withoutStatus.length > 0 && (
              <div className="w-52 flex-shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-gray-500">Geen status</h3>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm">
                    {withoutStatus.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {withoutStatus.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onOpenPanel={setSelectedProject}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sidepanel project detail */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedProject(null)}>
          <div className="flex-1" />
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">
                  {selectedProject.name}
                </h2>
                <p className="text-xs text-gray-400">{PROJECT_TYPE_LABELS[selectedProject.type]}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2 ml-2">
                <a
                  href={`/projecten/${selectedProject.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FolderIcon className="h-3.5 w-3.5" />
                  Project openen
                </a>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Basisinfo */}
              <div className="space-y-2 text-sm">
                {selectedProject.address && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <HomeIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    {selectedProject.address}
                  </div>
                )}
                {selectedProject.contactName && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">👤</span>
                    {selectedProject.contactName}
                  </div>
                )}
                {selectedProject.contactPhone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <PhoneIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    {selectedProject.contactPhone}
                  </div>
                )}
              </div>

              {/* Status wijzigen */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Status wijzigen</p>
                <div className="space-y-1.5">
                  {stages.map((stage) => {
                    const isActive = selectedProject.projectStatus === stage;
                    return (
                      <button
                        key={stage}
                        onClick={() => !isActive && handleUpdateStatus(selectedProject, stage)}
                        disabled={statusUpdating || isActive}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary text-white"
                            : "border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        }`}
                      >
                        {STATUS_LABELS[stage] || stage}
                        {isActive && (
                          <span className="ml-2 h-2 w-2 rounded-full bg-white/70" />
                        )}
                      </button>
                    );
                  })}
                  {statusMessage && (
                    <p className={`text-xs ${statusMessage.includes("Fout") || statusMessage.includes("fout") ? "text-red-600" : "text-green-600"}`}>
                      {statusMessage}
                    </p>
                  )}
                </div>
              </div>

              {/* Naar project */}
              <a
                href={`/projecten/${selectedProject.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                Volledig projectdossier openen
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Nieuw project modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nieuw project</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Projectnaam *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="bijv. Verkoop Hoofdstraat 12 Spijkenisse"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="mb-5">
                <label className="mb-2 block text-sm font-medium text-gray-700">Type</label>
                <div className="flex gap-2">
                  {(["VERKOOP", "AANKOOP", "TAXATIE"] as ActiveType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        newType === t
                          ? PROJECT_TYPE_COLORS[t] + " ring-2 ring-offset-1 ring-primary/30"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {PROJECT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  <PlusIcon className="h-4 w-4" />
                  {creating ? "Aanmaken..." : "Aanmaken & openen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
