"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  PlusIcon,
  FunnelIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  CalendarIcon,
  FolderIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import ProjectSelector from "@/components/projects/ProjectSelector";

interface User {
  id: string;
  name: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
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
  project: Project | null;
  completedAt: string | null;
  createdAt: string;
}

type ViewMode = "tabel" | "kanban";

const CATEGORIES = [
  "binnendienst",
  "verkoop",
  "aankoop",
  "taxatie",
  "administratie",
];

const EMPTY_TASK_FORM = {
  title: "",
  description: "",
  priority: "normaal",
  category: "",
  dueDate: "",
  assigneeId: "",
  projectId: "",
};

function TaskForm({
  values,
  onChange,
  onSubmit,
  saving: isSaving,
  onCancel,
  submitLabel,
  extraActions,
  users,
}: {
  values: typeof EMPTY_TASK_FORM;
  onChange: (v: typeof EMPTY_TASK_FORM) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  onCancel: () => void;
  submitLabel: string;
  extraActions?: React.ReactNode;
  users: User[];
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium text-gray-700">Titel *</label>
        <input
          type="text"
          required
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Wat moet er gedaan worden?"
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Extra details..."
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Toewijzen aan *</label>
          <select
            required
            value={values.assigneeId}
            onChange={(e) => onChange({ ...values, assigneeId: e.target.value })}
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Prioriteit</label>
          <select
            value={values.priority}
            onChange={(e) => onChange({ ...values, priority: e.target.value })}
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Categorie</label>
          <select
            value={values.category}
            onChange={(e) => onChange({ ...values, category: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Geen</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Deadline</label>
          <input
            type="date"
            value={values.dueDate}
            onChange={(e) => onChange({ ...values, dueDate: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium text-gray-700">Project</label>
        <ProjectSelector
          value={values.projectId}
          onChange={(val) => onChange({ ...values, projectId: val })}
          className="w-full"
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div>{extraActions}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Annuleren
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {isSaving ? "Opslaan..." : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function TakenPage() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]); // kanban: open+bezig + laatste 10 afgerond
  const [allTasks, setAllTasks] = useState<Task[]>([]); // tabel: alles
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProject, setFilterProject] = useState("");

  // Nieuw taak modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ ...EMPTY_TASK_FORM });
  const [saving, setSaving] = useState(false);

  // Bewerk modal
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_TASK_FORM });
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);

    const baseParams = new URLSearchParams();
    if (filterAssignee) baseParams.set("assigneeId", filterAssignee);
    if (filterCategory) baseParams.set("category", filterCategory);
    if (filterProject) baseParams.set("projectId", filterProject);

    // Open + bezig: gesorteerd op deadline oplopend
    const activeParams = new URLSearchParams(baseParams);
    activeParams.set("status", "open,bezig");
    activeParams.set("sortBy", "dueDate");
    activeParams.set("sortOrder", "asc");
    activeParams.set("limit", "200");

    // Afgerond: laatste 10, gesorteerd op completedAt aflopend
    const doneParams = new URLSearchParams(baseParams);
    doneParams.set("status", "afgerond");
    doneParams.set("sortBy", "completedAt");
    doneParams.set("sortOrder", "desc");
    doneParams.set("limit", "10");

    // Tabel: alles, gesorteerd op status + deadline
    const allParams = new URLSearchParams(baseParams);
    allParams.set("sortBy", "dueDate");
    allParams.set("sortOrder", "asc");
    allParams.set("limit", "200");

    try {
      const [activeRes, doneRes, allRes] = await Promise.all([
        fetch(`/api/taken?${activeParams}`),
        fetch(`/api/taken?${doneParams}`),
        fetch(`/api/taken?${allParams}`),
      ]);
      const [activeData, doneData, allData] = await Promise.all([
        activeRes.json(),
        doneRes.json(),
        allRes.json(),
      ]);
      setTasks([...(activeData.tasks || []), ...(doneData.tasks || [])]);
      setAllTasks(allData.tasks || []);
    } catch {
      console.error("Fout bij ophalen taken");
    }
    setLoading(false);
  }, [filterAssignee, filterCategory, filterProject]);

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
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...newTask,
        projectId: newTask.projectId || undefined,
      };
      const response = await fetch("/api/taken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowNewTask(false);
        setNewTask({ ...EMPTY_TASK_FORM });
        fetchTasks();
      }
    } catch {
      console.error("Fout bij aanmaken taak");
    }
    setSaving(false);
  }

  function openEditModal(task: Task) {
    setEditTask(task);
    setEditForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      category: task.category || "",
      dueDate: task.dueDate ? task.dueDate.substring(0, 10) : "",
      assigneeId: task.assignee.id,
      projectId: task.project?.id || "",
    });
    setShowDeleteConfirm(false);
  }

  async function handleUpdateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!editTask) return;
    setEditSaving(true);
    try {
      const response = await fetch("/api/taken", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTask.id,
          title: editForm.title,
          description: editForm.description || null,
          priority: editForm.priority,
          category: editForm.category || null,
          dueDate: editForm.dueDate || null,
          assigneeId: editForm.assigneeId,
          projectId: editForm.projectId || null,
        }),
      });
      if (response.ok) {
        setEditTask(null);
        fetchTasks();
      }
    } catch {
      console.error("Fout bij bijwerken taak");
    }
    setEditSaving(false);
  }

  async function handleDeleteTask() {
    if (!editTask) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/taken", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTask.id }),
      });
      if (response.ok) {
        setEditTask(null);
        fetchTasks();
      }
    } catch {
      console.error("Fout bij verwijderen taak");
    }
    setDeleting(false);
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    try {
      await fetch("/api/taken", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      fetchTasks();
    } catch {
      console.error("Fout bij bijwerken taak");
    }
  }

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

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
    });
  }

  function isOverdue(dateStr: string | null) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Taken</h1>
          <p className="mt-1 text-sm text-gray-500">Beheer taken en opdrachten</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "kanban" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setViewMode("tabel")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "tabel" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              Tabel
            </button>
          </div>

          <button
            onClick={() => {
              setNewTask({ ...EMPTY_TASK_FORM, assigneeId: session?.user?.id || "" });
              setShowNewTask(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            <PlusIcon className="h-4 w-4" />
            Nieuwe taak
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FunnelIcon className="h-4 w-4 text-gray-400" />
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Alle personen</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.name}</option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">Alle categorieën</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
          ))}
        </select>

        <ProjectSelector
          value={filterProject}
          onChange={setFilterProject}
          emptyLabel="Alle projecten"
        />
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-3 gap-4">
          {statusGroups.map((group) => {
            const groupTasks = tasks.filter((t) => t.status === group.key);
            return (
              <div key={group.key} className="rounded-xl bg-gray-100 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <group.icon className={`h-5 w-5 ${group.color}`} />
                  <h3 className="text-sm font-semibold text-gray-700">{group.label}</h3>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {groupTasks.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {loading ? (
                    <div className="py-4 text-center text-sm text-gray-400">Laden...</div>
                  ) : groupTasks.length === 0 ? (
                    <div className="py-4 text-center text-sm text-gray-400">Geen taken</div>
                  ) : (
                    groupTasks.map((task) => (
                      <div
                        key={task.id}
                        className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <h4 className="text-sm font-medium text-gray-900">{task.title}</h4>
                          <div className="ml-2 flex shrink-0 items-center gap-1">
                            <span
                              className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                                priorityColors[task.priority] || priorityColors.normaal
                              }`}
                            >
                              {task.priority}
                            </span>
                            <button
                              onClick={() => openEditModal(task)}
                              className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
                              title="Taak bewerken"
                            >
                              <PencilSquareIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {task.description && (
                          <p className="mb-2 text-xs text-gray-500 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        {task.project && (
                          <a
                            href={`/projecten/${task.project.id}`}
                            className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                          >
                            <FolderIcon className="h-3 w-3" />
                            {task.project.name}
                          </a>
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
                                isOverdue(task.dueDate) && task.status !== "afgerond"
                                  ? "font-medium text-red-600"
                                  : "text-gray-400"
                              }`}
                            >
                              <CalendarIcon className="h-3 w-3" />
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                        </div>

                        {/* Status knoppen */}
                        <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
                          {group.key !== "open" && (
                            <button
                              onClick={() => updateTaskStatus(task.id, "open")}
                              className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100"
                            >
                              Open
                            </button>
                          )}
                          {group.key !== "bezig" && (
                            <button
                              onClick={() => updateTaskStatus(task.id, "bezig")}
                              className="rounded px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50"
                            >
                              Bezig
                            </button>
                          )}
                          {group.key !== "afgerond" && (
                            <button
                              onClick={() => updateTaskStatus(task.id, "afgerond")}
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
      )}

      {/* Tabel View */}
      {viewMode === "tabel" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Taak</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Toegewezen</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Prioriteit</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Deadline</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {allTasks.map((task) => (
                <tr key={task.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{task.title}</div>
                    {task.category && (
                      <span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                        {task.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {task.project ? (
                      <a
                        href={`/projecten/${task.project.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        <FolderIcon className="h-3 w-3" />
                        {task.project.name}
                      </a>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{task.assignee.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${priorityColors[task.priority]}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {task.dueDate ? (
                      <span className={
                        isOverdue(task.dueDate) && task.status !== "afgerond"
                          ? "font-medium text-red-600"
                          : "text-gray-600"
                      }>
                        {formatDate(task.dueDate)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={task.status}
                      onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    >
                      <option value="open">Open</option>
                      <option value="bezig">Bezig</option>
                      <option value="afgerond">Afgerond</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEditModal(task)}
                      className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      title="Taak bewerken"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nieuwe taak modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nieuwe taak</h2>
              <button
                onClick={() => setShowNewTask(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <TaskForm
              values={newTask}
              onChange={setNewTask}
              onSubmit={handleCreateTask}
              saving={saving}
              onCancel={() => setShowNewTask(false)}
              submitLabel="Taak aanmaken"
              users={users}
            />
          </div>
        </div>
      )}

      {/* Bewerk modal */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Taak bewerken</h2>
              <button
                onClick={() => setEditTask(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Status toggle in bewerk modal */}
            <div className="mb-4 flex gap-2">
              {["open", "bezig", "afgerond"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={async () => {
                    await updateTaskStatus(editTask.id, s);
                    setEditTask({ ...editTask, status: s });
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    editTask.status === s
                      ? s === "open"
                        ? "bg-amber-100 text-amber-700"
                        : s === "bezig"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            <TaskForm
              values={editForm}
              onChange={setEditForm}
              onSubmit={handleUpdateTask}
              saving={editSaving}
              onCancel={() => setEditTask(null)}
              submitLabel="Wijzigingen opslaan"
              users={users}
              extraActions={
                showDeleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Zeker weten?</span>
                    <button
                      type="button"
                      onClick={handleDeleteTask}
                      disabled={deleting}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "Verwijderen..." : "Ja, verwijder"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Nee
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Verwijderen
                  </button>
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
