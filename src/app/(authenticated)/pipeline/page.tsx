"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  FireIcon,
  UserCircleIcon,
  ChartBarIcon,
  ArrowPathIcon,
  FolderIcon,
  PlusIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  PIPELINE_STAGES_AANKOOP,
  PIPELINE_STAGES_TAXATIE,
} from "@/lib/projectTypes";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

interface LinkedProject {
  id: string;
  name: string;
  type: string;
  projectStatus: string | null;
  status: string;
}

interface PipelineContact {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  points: number;
  lastActive: string | null;
  verkoopgesprekStatus: string | null;
  timingGesprek: string | null;
  segmentPrioriteit: string | null;
  verkoopreden: string | null;
  verkooopTiming: string | null;
  intentieVerkoop: string | null;
  emailFollowupVerstuurd: boolean;
  volgendeAfspraakStatus: string | null;
  datumVerkoopgesprek: string | null;
  interesses: {
    financiering: number | null;
    duurzaamheid: number | null;
    verbouwing: number | null;
    investeren: number | null;
    starters: number | null;
  };
  bezichtigingInteresse: number | null;
  warmScore: number;
  linkedProject: LinkedProject | null;
}

// Verkoop stages (Mautic verkoopgesprek_status)
const VERKOOP_STAGES = [
  { key: null, label: "Geen status", color: "bg-gray-50 border-gray-200" },
  { key: "gepland", label: "Gesprek gepland", color: "bg-blue-50 border-blue-200" },
  { key: "gehad", label: "Gesprek gehad", color: "bg-amber-50 border-amber-200" },
  { key: "followup_verstuurd", label: "Follow-up verstuurd", color: "bg-purple-50 border-purple-200" },
  { key: "offerte_geaccepteerd", label: "Offerte geaccepteerd", color: "bg-green-50 border-green-200" },
];

// Aankoop stages (based on ProjectStatus)
const AANKOOP_KANBAN = PIPELINE_STAGES_AANKOOP.map((s) => ({
  key: s,
  label: STATUS_LABELS[s] || s,
  color: "bg-gray-50 border-gray-200",
}));

// Taxatie stages
const TAXATIE_KANBAN = PIPELINE_STAGES_TAXATIE.map((s) => ({
  key: s,
  label: STATUS_LABELS[s] || s,
  color: "bg-gray-50 border-gray-200",
}));

const SEGMENT_LABELS: Record<string, string> = {
  a_sweetspot: "A",
  b_volledig: "B",
  c_recent: "C",
  d_oud: "D",
};

const SEGMENT_COLORS: Record<string, string> = {
  a_sweetspot: "bg-green-100 text-green-700",
  b_volledig: "bg-blue-100 text-blue-700",
  c_recent: "bg-amber-100 text-amber-700",
  d_oud: "bg-gray-100 text-gray-600",
};

const TIMING_LABELS: Record<string, string> = {
  zsm: "Zo snel mogelijk",
  "2weken": "< 2 weken",
  dezemaand: "Deze maand",
  volgendkwartaal: "Volgend kwartaal",
};

function isWarm(contact: PipelineContact): boolean {
  if (!contact.lastActive) return false;
  const daysSinceActive = (Date.now() - new Date(contact.lastActive).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceActive < 7;
}

function getTopInteresses(contact: PipelineContact): Array<{ label: string; value: number }> {
  const entries = [
    { label: "Financiering", value: contact.interesses.financiering },
    { label: "Duurzaamheid", value: contact.interesses.duurzaamheid },
    { label: "Verbouwing", value: contact.interesses.verbouwing },
    { label: "Investeren", value: contact.interesses.investeren },
    { label: "Starters", value: contact.interesses.starters },
  ].filter((e) => e.value !== null && e.value > 0) as Array<{ label: string; value: number }>;
  return entries.sort((a, b) => b.value - a.value).slice(0, 2);
}

function PointsBadge({ points }: { points: number }) {
  const color = points >= 50 ? "bg-green-100 text-green-700" : points >= 20 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${color}`}>
      {points} pts
    </span>
  );
}

function ContactCard({ contact, onOpenPanel }: { contact: PipelineContact; onOpenPanel: (contact: PipelineContact) => void }) {
  const warm = isWarm(contact);
  const topInteresses = getTopInteresses(contact);
  const name = `${contact.firstname} ${contact.lastname}`.trim() || `Contact #${contact.id}`;
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <button
              onClick={() => onOpenPanel(contact)}
              className="block truncate text-sm font-medium text-gray-900 hover:text-primary hover:underline text-left"
            >
              {name}
            </button>
            {contact.company && (
              <p className="truncate text-xs text-gray-400">{contact.company}</p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {warm && <FireIcon className="h-4 w-4 text-amber-500" title="Actief in de afgelopen 7 dagen" />}
          <a
            href={`${MAUTIC_URL}/s/contacts/view/${contact.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Project badge */}
      {contact.linkedProject && (
        <a
          href={`/projecten/${contact.linkedProject.id}`}
          className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80 ${PROJECT_TYPE_COLORS[contact.linkedProject.type] || "bg-gray-100 text-gray-600 border-gray-200"}`}
        >
          <FolderIcon className="h-3 w-3" />
          {contact.linkedProject.name}
        </a>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <PointsBadge points={contact.points} />
        {contact.segmentPrioriteit && (
          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${SEGMENT_COLORS[contact.segmentPrioriteit] || "bg-gray-100 text-gray-600"}`}>
            Seg. {SEGMENT_LABELS[contact.segmentPrioriteit] || contact.segmentPrioriteit}
          </span>
        )}
        {contact.timingGesprek && (
          <span className="inline-flex rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">
            {TIMING_LABELS[contact.timingGesprek] || contact.timingGesprek}
          </span>
        )}
      </div>

      {topInteresses.length > 0 && (
        <div className="mt-2 space-y-1">
          {topInteresses.map((interesse) => (
            <div key={interesse.label} className="flex items-center gap-1.5">
              <span className="w-20 flex-shrink-0 text-xs text-gray-400">{interesse.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${interesse.value}%` }}
                />
              </div>
              <span className="w-6 text-right text-xs text-gray-400">{interesse.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type ActiveType = "VERKOOP" | "AANKOOP" | "TAXATIE";

export default function PipelinePage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [timingFilter, setTimingFilter] = useState("");
  const [activeType, setActiveType] = useState<ActiveType>("VERKOOP");
  const [selectedContact, setSelectedContact] = useState<PipelineContact | null>(null);

  // Status update
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Create project modal
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [createProjectContact, setCreateProjectContact] = useState<PipelineContact | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<ActiveType>("VERKOOP");
  const [projectCreating, setProjectCreating] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (search.trim()) params.set("search", search.trim());
      if (segmentFilter) params.set("segment", segmentFilter);
      const res = await fetch(`/api/mautic/contacts/pipeline?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch { console.error("Fout bij ophalen pipeline"); }
    setLoading(false);
  }, [search, segmentFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const filteredContacts = timingFilter
    ? contacts.filter((c) => c.timingGesprek === timingFilter)
    : contacts;

  // --- Verkoop: group by verkoopgesprek_status
  const verkoopByStage = VERKOOP_STAGES.reduce((acc, stage) => {
    acc[String(stage.key)] = filteredContacts.filter((c) => (c.verkoopgesprekStatus || null) === stage.key);
    return acc;
  }, {} as Record<string, PipelineContact[]>);

  // --- Aankoop/Taxatie: group by linkedProject.projectStatus
  const getProjectStageContacts = (stages: typeof AANKOOP_KANBAN) => {
    return stages.reduce((acc, stage) => {
      acc[stage.key] = filteredContacts.filter(
        (c) => c.linkedProject?.type === activeType && (c.linkedProject?.projectStatus === stage.key)
      );
      return acc;
    }, {} as Record<string, PipelineContact[]>);
  };

  const totalWarm = filteredContacts.filter(isWarm).length;

  async function handleUpdateVerkoopStatus(contact: PipelineContact, newStatus: string | null) {
    setStatusUpdating(true);
    setStatusMessage("");
    try {
      const res = await fetch("/api/mautic/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contact.id,
          fields: { verkoopgesprek_status: newStatus || "" },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage("Status bijgewerkt");
        // Update lokaal
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id ? { ...c, verkoopgesprekStatus: newStatus } : c
          )
        );
        if (selectedContact?.id === contact.id) {
          setSelectedContact((prev) => prev ? { ...prev, verkoopgesprekStatus: newStatus } : prev);
        }
        setTimeout(() => setStatusMessage(""), 2000);
      } else {
        setStatusMessage("Fout bij bijwerken");
      }
    } catch {
      setStatusMessage("Netwerkfout");
    }
    setStatusUpdating(false);
  }

  function openCreateProject(contact: PipelineContact) {
    setCreateProjectContact(contact);
    const name = `${contact.firstname} ${contact.lastname}`.trim() || `Contact #${contact.id}`;
    setNewProjectName(name);
    setNewProjectType(activeType);
    setShowCreateProject(true);
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!createProjectContact) return;
    setProjectCreating(true);
    try {
      // Maak project aan
      const res = await fetch("/api/projecten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName,
          type: newProjectType,
          projectStatus: "LEAD",
          status: "lead",
          mauticContactId: createProjectContact.id,
        }),
      });
      const data = await res.json();
      if (data.success && data.project) {
        // Koppel contact
        await fetch(`/api/projecten/${data.project.id}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mauticContactId: createProjectContact.id, role: "opdrachtgever" }),
        });
        setShowCreateProject(false);
        setSelectedContact(null);
        router.push(`/projecten/${data.project.id}`);
      }
    } catch { console.error("Fout bij aanmaken project"); }
    setProjectCreating(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredContacts.length} contacten
            {totalWarm > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                <FireIcon className="h-3.5 w-3.5" />
                {totalWarm} warm
              </span>
            )}
          </p>
        </div>
        <button
          onClick={fetchContacts}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Vernieuwen
        </button>
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

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek contact..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Alle segmenten</option>
          <option value="a_sweetspot">A — Sweet Spot</option>
          <option value="b_volledig">B — Volledige transactie</option>
          <option value="c_recent">C — Recent</option>
          <option value="d_oud">D — Oud</option>
        </select>
        {activeType === "VERKOOP" && (
          <select
            value={timingFilter}
            onChange={(e) => setTimingFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Alle timing</option>
            <option value="zsm">Zo snel mogelijk</option>
            <option value="2weken">Binnen 2 weken</option>
            <option value="dezemaand">Deze maand</option>
            <option value="volgendkwartaal">Volgend kwartaal</option>
          </select>
        )}
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Pipeline laden...</div>
      ) : activeType === "VERKOOP" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {VERKOOP_STAGES.map((stage) => {
            const stageContacts = verkoopByStage[String(stage.key)] || [];
            return (
              <div key={String(stage.key)} className={`rounded-xl border p-3 ${stage.color}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{stage.label}</h3>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm">
                    {stageContacts.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageContacts.length === 0 && (
                    <p className="py-4 text-center text-xs text-gray-400">Leeg</p>
                  )}
                  {stageContacts.map((contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      onOpenPanel={setSelectedContact}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : activeType === "AANKOOP" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-7">
          {(() => {
            const byStage = getProjectStageContacts(AANKOOP_KANBAN);
            return AANKOOP_KANBAN.map((stage) => {
              const stageContacts = byStage[stage.key] || [];
              const stageColor = STATUS_COLORS[stage.key] ? STATUS_COLORS[stage.key].replace(/text-\S+/, "").replace(/bg-/, "bg-").trim() : "bg-gray-50";
              return (
                <div key={stage.key} className={`rounded-xl border border-gray-200 p-3 ${stageColor || "bg-gray-50"}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700">{stage.label}</h3>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm">
                      {stageContacts.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {stageContacts.length === 0 && (
                      <p className="py-4 text-center text-xs text-gray-400">Leeg</p>
                    )}
                    {stageContacts.map((contact) => (
                      <ContactCard key={contact.id} contact={contact} onOpenPanel={setSelectedContact} />
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        /* TAXATIE */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {(() => {
            const byStage = getProjectStageContacts(TAXATIE_KANBAN);
            return TAXATIE_KANBAN.map((stage) => {
              const stageContacts = byStage[stage.key] || [];
              return (
                <div key={stage.key} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-700">{stage.label}</h3>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-medium text-gray-600 shadow-sm">
                      {stageContacts.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {stageContacts.length === 0 && (
                      <p className="py-4 text-center text-xs text-gray-400">Leeg</p>
                    )}
                    {stageContacts.map((contact) => (
                      <ContactCard key={contact.id} contact={contact} onOpenPanel={setSelectedContact} />
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Contact detail sidepanel */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelectedContact(null)}>
          <div className="flex-1" />
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                {selectedContact.firstname} {selectedContact.lastname}
              </h2>
              <div className="flex items-center gap-2">
                <a
                  href={`${MAUTIC_URL}/s/contacts/view/${selectedContact.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                  Mautic
                </a>
                <button
                  onClick={() => setSelectedContact(null)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Project sectie */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Project</p>
                {selectedContact.linkedProject ? (
                  <a
                    href={`/projecten/${selectedContact.linkedProject.id}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:opacity-80 ${PROJECT_TYPE_COLORS[selectedContact.linkedProject.type] || "border-gray-200 bg-gray-50 text-gray-700"}`}
                  >
                    <FolderIcon className="h-4 w-4" />
                    <div>
                      <p>{selectedContact.linkedProject.name}</p>
                      <p className="text-xs opacity-70">
                        {PROJECT_TYPE_LABELS[selectedContact.linkedProject.type]} · {STATUS_LABELS[selectedContact.linkedProject.projectStatus || ""] || selectedContact.linkedProject.status}
                      </p>
                    </div>
                    <ArrowTopRightOnSquareIcon className="ml-auto h-3.5 w-3.5 opacity-50" />
                  </a>
                ) : (
                  <button
                    onClick={() => openCreateProject(selectedContact)}
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:border-primary hover:text-primary"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Project aanmaken
                  </button>
                )}
              </div>

              {/* Basis info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserCircleIcon className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Contactinfo</span>
                </div>
                <div className="space-y-1 text-sm">
                  {selectedContact.email && <p className="text-gray-600">📧 {selectedContact.email}</p>}
                  {selectedContact.phone && <p className="text-gray-600">📞 {selectedContact.phone}</p>}
                  {selectedContact.mobile && <p className="text-gray-600">📱 {selectedContact.mobile}</p>}
                  {selectedContact.company && <p className="text-gray-600">🏢 {selectedContact.company}</p>}
                </div>
              </div>

              {/* Scores */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <ChartBarIcon className="h-5 w-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Lead scores</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-gray-50 p-2 text-center">
                    <p className="text-2xl font-bold text-gray-900">{selectedContact.points}</p>
                    <p className="text-xs text-gray-500">Totaal punten</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2 text-center">
                    <p className="text-2xl font-bold text-gray-900">{selectedContact.warmScore}</p>
                    <p className="text-xs text-gray-500">Warm score</p>
                  </div>
                </div>
              </div>

              {/* Verkoopstatus wijzigen (alleen bij Verkoop tab) */}
              {activeType === "VERKOOP" && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Status gesprek</p>
                  <div className="space-y-1.5">
                    {VERKOOP_STAGES.map((stage) => {
                      const isActive = (selectedContact.verkoopgesprekStatus || null) === stage.key;
                      return (
                        <button
                          key={String(stage.key)}
                          onClick={() => !isActive && handleUpdateVerkoopStatus(selectedContact, stage.key)}
                          disabled={statusUpdating || isActive}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-white"
                              : "border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          }`}
                        >
                          {stage.label}
                          {isActive && <CheckIcon className="h-4 w-4" />}
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
              )}

              {/* Verkoopproces details */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Verkoopproces</p>
                <dl className="space-y-1.5 text-sm">
                  {selectedContact.timingGesprek && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Timing</dt>
                      <dd className="font-medium text-gray-900">{TIMING_LABELS[selectedContact.timingGesprek] || selectedContact.timingGesprek}</dd>
                    </div>
                  )}
                  {selectedContact.verkoopreden && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Reden verkoop</dt>
                      <dd className="font-medium text-gray-900">{selectedContact.verkoopreden}</dd>
                    </div>
                  )}
                  {selectedContact.segmentPrioriteit && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Segment</dt>
                      <dd>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEGMENT_COLORS[selectedContact.segmentPrioriteit] || "bg-gray-100"}`}>
                          {SEGMENT_LABELS[selectedContact.segmentPrioriteit] || selectedContact.segmentPrioriteit}
                        </span>
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Follow-up verstuurd</dt>
                    <dd className="font-medium text-gray-900">{selectedContact.emailFollowupVerstuurd ? "Ja" : "Nee"}</dd>
                  </div>
                </dl>
              </div>

              {/* Interesse scores */}
              {Object.values(selectedContact.interesses).some((v) => v !== null && v > 0) && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Interesse scores</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Financiering", value: selectedContact.interesses.financiering },
                      { label: "Duurzaamheid", value: selectedContact.interesses.duurzaamheid },
                      { label: "Verbouwing", value: selectedContact.interesses.verbouwing },
                      { label: "Investeren", value: selectedContact.interesses.investeren },
                      { label: "Starters", value: selectedContact.interesses.starters },
                    ].filter((e) => e.value !== null).map((interesse) => (
                      <div key={interesse.label} className="flex items-center gap-2">
                        <span className="w-24 flex-shrink-0 text-xs text-gray-500">{interesse.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${interesse.value}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-medium text-gray-700">{interesse.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Laatste activiteit */}
              {selectedContact.lastActive && (
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Laatste activiteit: {new Date(selectedContact.lastActive).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                  {isWarm(selectedContact) && (
                    <span className="ml-2 inline-flex items-center gap-1 font-medium text-amber-600">
                      <FireIcon className="h-3.5 w-3.5" /> Warm contact
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Project aanmaken modal */}
      {showCreateProject && createProjectContact && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Project aanmaken</h2>
              <button onClick={() => setShowCreateProject(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Projectnaam *</label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">Type</label>
                <div className="flex gap-2">
                  {(["VERKOOP", "AANKOOP", "TAXATIE"] as ActiveType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewProjectType(t)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        newProjectType === t
                          ? PROJECT_TYPE_COLORS[t] + " ring-2 ring-offset-1 ring-primary/30"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {PROJECT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                Contact <strong>{createProjectContact.firstname} {createProjectContact.lastname}</strong> wordt automatisch als opdrachtgever gekoppeld.
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreateProject(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Annuleren
                </button>
                <button type="submit" disabled={projectCreating}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
                  <PlusIcon className="h-4 w-4" />
                  {projectCreating ? "Aanmaken..." : "Aanmaken & openen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
