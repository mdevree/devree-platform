"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeftIcon,
  PencilIcon,
  FolderIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserIcon,
  PlusIcon,
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  CalendarIcon,
  PhoneArrowDownLeftIcon,
  PhoneArrowUpRightIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

interface User {
  id: string;
  name: string;
  role: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  category: string | null;
  assignee: User;
  creator: { id: string; name: string };
  completedAt: string | null;
  createdAt: string;
}

interface Call {
  id: string;
  callId: string;
  timestamp: string;
  status: string;
  reason: string | null;
  direction: string;
  callerNumber: string;
  callerName: string | null;
  destinationNumber: string;
  destinationUser: string | null;
  contactName: string | null;
  mauticContactId: number | null;
}

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
  tasks: Task[];
  calls: Call[];
  createdAt: string;
  updatedAt: string;
}

type ActiveTab = "taken" | "telefonie";

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

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  hoog: "bg-orange-100 text-orange-700 border-orange-200",
  normaal: "bg-blue-100 text-blue-700 border-blue-200",
  laag: "bg-gray-100 text-gray-600 border-gray-200",
};

const statusGroups = [
  { key: "open", label: "Open", icon: ExclamationCircleIcon, color: "text-amber-500" },
  { key: "bezig", label: "Bezig", icon: ClockIcon, color: "text-blue-500" },
  { key: "afgerond", label: "Afgerond", icon: CheckCircleIcon, color: "text-green-500" },
];

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("taken");
  const [users, setUsers] = useState<User[]>([]);

  // Edit project modal
  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState({
    name: "",
    description: "",
    status: "",
    address: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  // Nieuwe taak modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "normaal",
    category: "",
    dueDate: "",
    assigneeId: "",
  });
  const [taskSaving, setTaskSaving] = useState(false);

  const categories = [
    "binnendienst",
    "verkoop",
    "aankoop",
    "taxatie",
    "administratie",
  ];

  const fetchProject = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projecten/${projectId}`);
      if (!response.ok) {
        router.push("/projecten");
        return;
      }
      const data = await response.json();
      setProject(data.project);
    } catch {
      console.error("Fout bij ophalen project");
    }
    setLoading(false);
  }, [projectId, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/users");
      const data = await response.json();
      setUsers(data.users || []);
    } catch {
      console.error("Fout bij ophalen gebruikers");
    }
  }, []);

  useEffect(() => {
    fetchProject();
    fetchUsers();
  }, [fetchProject, fetchUsers]);

  function openEdit() {
    if (!project) return;
    setEditData({
      name: project.name,
      description: project.description || "",
      status: project.status,
      address: project.address || "",
      contactName: project.contactName || "",
      contactPhone: project.contactPhone || "",
      contactEmail: project.contactEmail || "",
    });
    setShowEdit(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);

    try {
      const response = await fetch("/api/projecten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: projectId, ...editData }),
      });

      if (response.ok) {
        setShowEdit(false);
        fetchProject();
      }
    } catch {
      console.error("Fout bij bijwerken project");
    }
    setEditSaving(false);
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setTaskSaving(true);

    try {
      const response = await fetch("/api/taken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTask, projectId }),
      });

      if (response.ok) {
        setShowNewTask(false);
        setNewTask({
          title: "",
          description: "",
          priority: "normaal",
          category: "",
          dueDate: "",
          assigneeId: "",
        });
        fetchProject();
      }
    } catch {
      console.error("Fout bij aanmaken taak");
    }
    setTaskSaving(false);
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    try {
      await fetch("/api/taken", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      fetchProject();
    } catch {
      console.error("Fout bij bijwerken taak");
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    });
  }

  function formatTime(timestamp: string) {
    return new Date(timestamp).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isOverdue(dateStr: string | null) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  function getReasonBadge(reason: string | null) {
    if (reason === "completed" || reason === "answered") {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          Beantwoord
        </span>
      );
    }
    if (reason === "no-answer") {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Geen antwoord
        </span>
      );
    }
    if (reason === "busy") {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          In gesprek
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        {reason || "Onbekend"}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">Project laden...</div>
    );
  }

  if (!project) {
    return (
      <div className="py-12 text-center text-gray-500">
        Project niet gevonden
      </div>
    );
  }

  const openTasks = project.tasks.filter((t) => t.status !== "afgerond").length;
  const completedTasks = project.tasks.filter((t) => t.status === "afgerond").length;

  return (
    <div>
      {/* Terug knop */}
      <button
        onClick={() => router.push("/projecten")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Terug naar projecten
      </button>

      {/* Project header */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50">
              <FolderIcon className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">
                  {project.name}
                </h1>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    statusColors[project.status] || statusColors.lead
                  }`}
                >
                  {statusLabels[project.status] || project.status}
                </span>
              </div>
              {project.address && (
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                  <MapPinIcon className="h-4 w-4" />
                  {project.address}
                </p>
              )}
              {project.description && (
                <p className="mt-2 text-sm text-gray-600">
                  {project.description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={openEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <PencilIcon className="h-4 w-4" />
            Bewerken
          </button>
        </div>

        {/* Contact + stats */}
        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-gray-100 pt-4">
          {project.contactName && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
              <UserIcon className="h-4 w-4 text-gray-400" />
              {project.contactName}
            </span>
          )}
          {project.contactPhone && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
              <PhoneIcon className="h-4 w-4 text-gray-400" />
              {project.contactPhone}
            </span>
          )}
          {project.contactEmail && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
              <EnvelopeIcon className="h-4 w-4 text-gray-400" />
              {project.contactEmail}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {openTasks} open, {completedTasks} afgerond · {project.calls.length}{" "}
            gesprekken
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("taken")}
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "taken"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardDocumentListIcon className="h-4 w-4" />
          Taken ({project.tasks.length})
        </button>
        <button
          onClick={() => setActiveTab("telefonie")}
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "telefonie"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <PhoneIcon className="h-4 w-4" />
          Telefonie ({project.calls.length})
        </button>
      </div>

      {/* Taken tab */}
      {activeTab === "taken" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => {
                setNewTask((t) => ({
                  ...t,
                  assigneeId: session?.user?.id || "",
                }));
                setShowNewTask(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              <PlusIcon className="h-4 w-4" />
              Nieuwe taak
            </button>
          </div>

          {/* Kanban */}
          <div className="grid grid-cols-3 gap-4">
            {statusGroups.map((group) => {
              const groupTasks = project.tasks.filter(
                (t) => t.status === group.key
              );
              return (
                <div key={group.key} className="rounded-xl bg-gray-100 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <group.icon className={`h-5 w-5 ${group.color}`} />
                    <h3 className="text-sm font-semibold text-gray-700">
                      {group.label}
                    </h3>
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {groupTasks.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {groupTasks.length === 0 ? (
                      <div className="py-4 text-center text-sm text-gray-400">
                        Geen taken
                      </div>
                    ) : (
                      groupTasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                        >
                          <div className="mb-2 flex items-start justify-between">
                            <h4 className="text-sm font-medium text-gray-900">
                              {task.title}
                            </h4>
                            <span
                              className={`ml-2 inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                                priorityColors[task.priority] ||
                                priorityColors.normaal
                              }`}
                            >
                              {task.priority}
                            </span>
                          </div>

                          {task.description && (
                            <p className="mb-2 text-xs text-gray-500 line-clamp-2">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                {task.assignee.name.split(" ")[0]}
                              </span>
                              {task.category && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                  {task.category}
                                </span>
                              )}
                            </div>

                            {task.dueDate && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] ${
                                  isOverdue(task.dueDate) &&
                                  task.status !== "afgerond"
                                    ? "font-medium text-red-600"
                                    : "text-gray-400"
                                }`}
                              >
                                <CalendarIcon className="h-3 w-3" />
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
                            {group.key !== "open" && (
                              <button
                                onClick={() =>
                                  updateTaskStatus(task.id, "open")
                                }
                                className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100"
                              >
                                Open
                              </button>
                            )}
                            {group.key !== "bezig" && (
                              <button
                                onClick={() =>
                                  updateTaskStatus(task.id, "bezig")
                                }
                                className="rounded px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50"
                              >
                                Bezig
                              </button>
                            )}
                            {group.key !== "afgerond" && (
                              <button
                                onClick={() =>
                                  updateTaskStatus(task.id, "afgerond")
                                }
                                className="rounded px-2 py-0.5 text-[10px] text-green-600 hover:bg-green-50"
                              >
                                Afgerond
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Telefonie tab */}
      {activeTab === "telefonie" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Tijd
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Richting
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Nummer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {project.calls.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Geen gekoppelde gesprekken
                  </td>
                </tr>
              ) : (
                project.calls.map((call) => (
                  <tr
                    key={call.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatTime(call.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      {call.direction === "inbound" ? (
                        <span className="inline-flex items-center gap-1 text-sm text-primary">
                          <PhoneArrowDownLeftIcon className="h-4 w-4" />
                          Inkomend
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                          <PhoneArrowUpRightIcon className="h-4 w-4" />
                          Uitgaand
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="font-mono text-gray-900">
                        {call.direction === "inbound"
                          ? call.callerNumber
                          : call.destinationNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {call.contactName ? (
                        <span className="font-medium text-gray-900">
                          {call.contactName}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getReasonBadge(call.reason)}
                    </td>
                    <td className="px-4 py-3">
                      {call.mauticContactId && (
                        <a
                          href={`${process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl"}/s/contacts/view/${call.mauticContactId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          Mautic
                          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit project modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Project bewerken
              </h2>
              <button
                onClick={() => setShowEdit(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSave}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Projectnaam *
                </label>
                <input
                  type="text"
                  required
                  value={editData.name}
                  onChange={(e) =>
                    setEditData((d) => ({ ...d, name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Omschrijving
                </label>
                <textarea
                  value={editData.description}
                  onChange={(e) =>
                    setEditData((d) => ({
                      ...d,
                      description: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={editData.status}
                    onChange={(e) =>
                      setEditData((d) => ({ ...d, status: e.target.value }))
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
                    value={editData.address}
                    onChange={(e) =>
                      setEditData((d) => ({ ...d, address: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
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
                      value={editData.contactName}
                      onChange={(e) =>
                        setEditData((d) => ({
                          ...d,
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
                      value={editData.contactPhone}
                      onChange={(e) =>
                        setEditData((d) => ({
                          ...d,
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
                      value={editData.contactEmail}
                      onChange={(e) =>
                        setEditData((d) => ({
                          ...d,
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
                  onClick={() => setShowEdit(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {editSaving ? "Opslaan..." : "Opslaan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nieuwe taak modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Nieuwe taak voor {project.name}
              </h2>
              <button
                onClick={() => setShowNewTask(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Titel *
                </label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask((t) => ({ ...t, title: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Wat moet er gedaan worden?"
                />
              </div>

              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Omschrijving
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) =>
                    setNewTask((t) => ({ ...t, description: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Toewijzen aan *
                  </label>
                  <select
                    required
                    value={newTask.assigneeId}
                    onChange={(e) =>
                      setNewTask((t) => ({
                        ...t,
                        assigneeId: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">Selecteer...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Prioriteit
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask((t) => ({ ...t, priority: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="laag">Laag</option>
                    <option value="normaal">Normaal</option>
                    <option value="hoog">Hoog</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Categorie
                  </label>
                  <select
                    value={newTask.category}
                    onChange={(e) =>
                      setNewTask((t) => ({ ...t, category: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">Geen</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) =>
                      setNewTask((t) => ({ ...t, dueDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewTask(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={taskSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {taskSaving ? "Opslaan..." : "Taak aanmaken"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
