"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeftIcon,
  PencilIcon,
  FolderIcon,
  HomeModernIcon,
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
  ChatBubbleLeftEllipsisIcon,
  UserCircleIcon,
  CheckIcon,
  TrashIcon,
  LinkSlashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

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
  _count: { notes: number };
}

interface CallNote {
  id: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

interface MauticContactFull {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  points: number;
  lastActive: string | null;
  address1: string | null;
  city: string | null;
  zipcode: string | null;
  country: string | null;
  website: string | null;
  aiProfile: string | null;
  tags: string[];
  dateAdded: string | null;
}

interface WoningData {
  id: number;
  slug: string;
  link: string;
  title: string;
  featuredImage: string | null;
  acf: {
    woning_status?: string;
    koopsom?: string | number;
    huurprijs?: string | number;
    woonoppervlakte?: string | number;
    perceeloppervlakte?: string | number;
    kamers?: string | number;
    slaapkamers?: string | number;
    bouwjaar?: string | number;
    soort_woning?: string;
    energielabel?: string;
    adres?: string;
    postcode?: string;
    plaats?: string;
    realworks_id?: string;
    [key: string]: unknown;
  };
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
  realworksId: string | null;
  tasks: Task[];
  calls: Call[];
  createdAt: string;
  updatedAt: string;
}

type ActiveTab = "taken" | "telefonie" | "woning";

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

  // Woning
  const [woning, setWoning] = useState<WoningData | null>(null);
  const [woningLoading, setWoningLoading] = useState(false);
  const [woningError, setWoningError] = useState<string | null>(null);
  const [woningStatusSaving, setWoningStatusSaving] = useState(false);
  const [woningStatusMessage, setWoningStatusMessage] = useState("");

  // Edit project modal
  const [showEdit, setShowEdit] = useState(false);
  const [editData, setEditData] = useState({
    name: "", description: "", status: "", address: "",
    contactName: "", contactPhone: "", contactEmail: "",
    realworksId: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  // Nieuwe taak modal
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "", description: "", priority: "normaal",
    category: "", dueDate: "", assigneeId: "",
  });
  const [taskSaving, setTaskSaving] = useState(false);

  // Notitie modal
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteCallId, setNoteCallId] = useState("");
  const [noteCallName, setNoteCallName] = useState("");
  const [notes, setNotes] = useState<CallNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Contact detail panel
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [contactDetail, setContactDetail] = useState<MauticContactFull | null>(null);
  const [contactDetailLoading, setContactDetailLoading] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactEditData, setContactEditData] = useState({
    firstname: "", lastname: "", email: "", phone: "", mobile: "",
    company: "", address1: "", city: "", zipcode: "", country: "", website: "",
  });
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEditMessage, setContactEditMessage] = useState("");

  const categories = ["binnendienst", "verkoop", "aankoop", "taxatie", "administratie"];

  const fetchProject = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projecten/${projectId}`);
      if (!response.ok) { router.push("/projecten"); return; }
      const data = await response.json();
      setProject(data.project);
    } catch { console.error("Fout bij ophalen project"); }
    setLoading(false);
  }, [projectId, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/users");
      const data = await response.json();
      setUsers(data.users || []);
    } catch { console.error("Fout bij ophalen gebruikers"); }
  }, []);

  const fetchWoning = useCallback(async (realworksId: string) => {
    setWoningLoading(true);
    setWoningError(null);
    setWoning(null);
    try {
      const res = await fetch(`/api/wordpress/woning?realworksId=${encodeURIComponent(realworksId)}`);
      const data = await res.json();
      if (res.ok) {
        setWoning(data);
      } else {
        setWoningError(data.error || "Woning niet gevonden");
      }
    } catch {
      setWoningError("Kan WordPress niet bereiken");
    }
    setWoningLoading(false);
  }, []);

  useEffect(() => { fetchProject(); fetchUsers(); }, [fetchProject, fetchUsers]);

  // Laad woning zodra de woning-tab actief wordt
  useEffect(() => {
    if (activeTab === "woning" && project?.realworksId && !woning && !woningLoading) {
      fetchWoning(project.realworksId);
    }
  }, [activeTab, project?.realworksId, woning, woningLoading, fetchWoning]);

  async function handleWoningStatusChange(newStatus: string) {
    if (!woning) return;
    setWoningStatusSaving(true);
    setWoningStatusMessage("");
    try {
      const res = await fetch("/api/wordpress/woning", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wpPostId: woning.id, acf: { woning_status: newStatus } }),
      });
      const data = await res.json();
      if (data.success) {
        setWoning((prev) => prev ? { ...prev, acf: { ...prev.acf, woning_status: newStatus } } : prev);
        setWoningStatusMessage("Status bijgewerkt op website");
        setTimeout(() => setWoningStatusMessage(""), 3000);
      } else {
        setWoningStatusMessage(data.error || "Fout bij opslaan");
      }
    } catch {
      setWoningStatusMessage("Netwerkfout");
    }
    setWoningStatusSaving(false);
  }

  function openEdit() {
    if (!project) return;
    setEditData({
      name: project.name, description: project.description || "",
      status: project.status, address: project.address || "",
      contactName: project.contactName || "", contactPhone: project.contactPhone || "",
      contactEmail: project.contactEmail || "",
      realworksId: project.realworksId || "",
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
        body: JSON.stringify({
          id: projectId,
          ...editData,
          realworksId: editData.realworksId || null,
        }),
      });
      if (response.ok) {
        setShowEdit(false);
        // Reset woning cache zodat die opnieuw geladen wordt
        setWoning(null);
        setWoningError(null);
        fetchProject();
      }
    } catch { console.error("Fout bij bijwerken project"); }
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
        setNewTask({ title: "", description: "", priority: "normaal", category: "", dueDate: "", assigneeId: "" });
        fetchProject();
      }
    } catch { console.error("Fout bij aanmaken taak"); }
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
    } catch { console.error("Fout bij bijwerken taak"); }
  }

  // --- Ontkoppel gesprek van project ---
  async function handleUnlinkCall(callId: string) {
    try {
      await fetch(`/api/calls/${callId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: null }),
      });
      fetchProject();
    } catch { console.error("Fout bij ontkoppelen gesprek"); }
  }

  // --- Notities ---
  async function openNoteModal(call: Call) {
    setNoteCallId(call.id);
    setNoteCallName(call.contactName || call.callerNumber || call.destinationNumber);
    setShowNoteModal(true);
    setNotes([]);
    setNewNote("");
    setNotesLoading(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/notes`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch { console.error("Fout bij ophalen notities"); }
    setNotesLoading(false);
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/calls/${noteCallId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: newNote.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setNotes((prev) => [data.note, ...prev]);
        setNewNote("");
        setProject((prev) =>
          prev ? {
            ...prev,
            calls: prev.calls.map((c) =>
              c.id === noteCallId ? { ...c, _count: { notes: (c._count?.notes || 0) + 1 } } : c
            ),
          } : prev
        );
      }
    } catch { console.error("Fout bij opslaan notitie"); }
    setNoteSaving(false);
  }

  async function handleDeleteNote(noteId: string) {
    try {
      await fetch(`/api/calls/${noteCallId}/notes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId }),
      });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setProject((prev) =>
        prev ? {
          ...prev,
          calls: prev.calls.map((c) =>
            c.id === noteCallId ? { ...c, _count: { notes: Math.max(0, (c._count?.notes || 0) - 1) } } : c
          ),
        } : prev
      );
    } catch { console.error("Fout bij verwijderen notitie"); }
  }

  // --- Contact detail ---
  async function openContactPanel(mauticId: number) {
    setShowContactPanel(true);
    setContactDetail(null);
    setContactDetailLoading(true);
    setEditingContact(false);
    setContactEditMessage("");
    try {
      const res = await fetch(`/api/mautic/contact?id=${mauticId}&full=1`);
      const data = await res.json();
      if (data.contact) {
        setContactDetail(data.contact);
        setContactEditData({
          firstname: data.contact.firstname || "",
          lastname: data.contact.lastname || "",
          email: data.contact.email || "",
          phone: data.contact.phone || "",
          mobile: data.contact.mobile || "",
          company: data.contact.company || "",
          address1: data.contact.address1 || "",
          city: data.contact.city || "",
          zipcode: data.contact.zipcode || "",
          country: data.contact.country || "",
          website: data.contact.website || "",
        });
      }
    } catch { console.error("Fout bij ophalen contact"); }
    setContactDetailLoading(false);
  }

  async function handleSaveContactFields() {
    if (!contactDetail) return;
    setContactEditSaving(true);
    setContactEditMessage("");
    try {
      const res = await fetch("/api/mautic/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactDetail.id, fields: contactEditData }),
      });
      const data = await res.json();
      if (data.success) {
        setContactEditMessage("Opgeslagen");
        setEditingContact(false);
        setContactDetail((prev) => prev ? {
          ...prev,
          firstname: contactEditData.firstname,
          lastname: contactEditData.lastname,
          email: contactEditData.email || null,
          phone: contactEditData.phone || null,
          mobile: contactEditData.mobile || null,
          company: contactEditData.company || null,
          address1: contactEditData.address1 || null,
          city: contactEditData.city || null,
          zipcode: contactEditData.zipcode || null,
          country: contactEditData.country || null,
          website: contactEditData.website || null,
        } : prev);
        setTimeout(() => setContactEditMessage(""), 3000);
      } else {
        setContactEditMessage("Fout bij opslaan");
      }
    } catch { setContactEditMessage("Netwerkfout"); }
    setContactEditSaving(false);
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleString("nl-NL", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  function formatDateFull(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function isOverdue(dateStr: string | null) {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  function getReasonBadge(reason: string | null) {
    if (reason === "completed" || reason === "answered") {
      return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Beantwoord</span>;
    }
    if (reason === "no-answer") {
      return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Geen antwoord</span>;
    }
    if (reason === "busy") {
      return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">In gesprek</span>;
    }
    if (reason === "cancelled") {
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Geannuleerd</span>;
    }
    return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{reason || "Onbekend"}</span>;
  }

  if (loading) return <div className="py-12 text-center text-gray-500">Project laden...</div>;
  if (!project) return <div className="py-12 text-center text-gray-500">Project niet gevonden</div>;

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
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] || statusColors.lead}`}>
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
                <p className="mt-2 text-sm text-gray-600">{project.description}</p>
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
            {openTasks} open, {completedTasks} afgerond · {project.calls.length} gesprekken
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("taken")}
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "taken" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardDocumentListIcon className="h-4 w-4" />
          Taken ({project.tasks.length})
        </button>
        <button
          onClick={() => setActiveTab("telefonie")}
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "telefonie" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <PhoneIcon className="h-4 w-4" />
          Telefonie ({project.calls.length})
        </button>
        <button
          onClick={() => setActiveTab("woning")}
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "woning" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <HomeModernIcon className="h-4 w-4" />
          Woning
          {project.realworksId && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {project.realworksId}
            </span>
          )}
        </button>
      </div>

      {/* ===== TAKEN TAB ===== */}
      {activeTab === "taken" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => {
                setNewTask((t) => ({ ...t, assigneeId: session?.user?.id || "" }));
                setShowNewTask(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              <PlusIcon className="h-4 w-4" />
              Nieuwe taak
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {statusGroups.map((group) => {
              const groupTasks = project.tasks.filter((t) => t.status === group.key);
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
                    {groupTasks.length === 0 ? (
                      <div className="py-4 text-center text-sm text-gray-400">Geen taken</div>
                    ) : (
                      groupTasks.map((task) => (
                        <div key={task.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
                          <div className="mb-2 flex items-start justify-between">
                            <h4 className="text-sm font-medium text-gray-900">{task.title}</h4>
                            <span className={`ml-2 inline-flex shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${priorityColors[task.priority] || priorityColors.normaal}`}>
                              {task.priority}
                            </span>
                          </div>

                          {task.description && (
                            <p className="mb-2 text-xs text-gray-500 line-clamp-2">{task.description}</p>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{task.assignee.name.split(" ")[0]}</span>
                              {task.category && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{task.category}</span>
                              )}
                            </div>
                            {task.dueDate && (
                              <span className={`inline-flex items-center gap-1 text-[10px] ${isOverdue(task.dueDate) && task.status !== "afgerond" ? "font-medium text-red-600" : "text-gray-400"}`}>
                                <CalendarIcon className="h-3 w-3" />
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
                            {group.key !== "open" && (
                              <button onClick={() => updateTaskStatus(task.id, "open")} className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100">Open</button>
                            )}
                            {group.key !== "bezig" && (
                              <button onClick={() => updateTaskStatus(task.id, "bezig")} className="rounded px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-50">Bezig</button>
                            )}
                            {group.key !== "afgerond" && (
                              <button onClick={() => updateTaskStatus(task.id, "afgerond")} className="rounded px-2 py-0.5 text-[10px] text-green-600 hover:bg-green-50">Afgerond</button>
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

      {/* ===== TELEFONIE TAB ===== */}
      {activeTab === "telefonie" && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Tijd</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Richting</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Nummer</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {project.calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Geen gekoppelde gesprekken</td>
                </tr>
              ) : (
                project.calls.map((call) => (
                  <tr key={call.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatDateTime(call.timestamp)}
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
                        {call.direction === "inbound" ? call.callerNumber : call.destinationNumber}
                      </span>
                      {call.callerName && (
                        <span className="ml-2 text-gray-500">({call.callerName})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {call.contactName ? (
                        <button
                          onClick={() => call.mauticContactId && openContactPanel(call.mauticContactId)}
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <UserCircleIcon className="h-4 w-4" />
                          {call.contactName}
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{getReasonBadge(call.reason)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Notitie knop */}
                        <button
                          onClick={() => openNoteModal(call)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                            call._count?.notes > 0
                              ? "bg-green-50 text-green-700 ring-1 ring-green-300 hover:bg-green-100"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                          }`}
                          title={call._count?.notes > 0 ? `${call._count.notes} notitie(s)` : "Notitie toevoegen"}
                        >
                          <ChatBubbleLeftEllipsisIcon className="h-3.5 w-3.5" />
                          Notitie
                          {call._count?.notes > 0 && (
                            <span className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white">
                              {call._count.notes}
                            </span>
                          )}
                        </button>

                        {/* Contact detail */}
                        {call.mauticContactId && (
                          <>
                            <button
                              onClick={() => openContactPanel(call.mauticContactId!)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                              title="Contact details"
                            >
                              <UserCircleIcon className="h-3.5 w-3.5" />
                              Contact
                            </button>
                            <a
                              href={`${MAUTIC_URL}/s/contacts/view/${call.mauticContactId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100"
                              title="Openen in Mautic"
                            >
                              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                            </a>
                          </>
                        )}

                        {/* Ontkoppelen van project */}
                        <button
                          onClick={() => handleUnlinkCall(call.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Ontkoppelen van project"
                        >
                          <LinkSlashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== WONING TAB ===== */}
      {activeTab === "woning" && (
        <div>
          {/* Geen Realworks ID ingesteld */}
          {!project.realworksId ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <HomeModernIcon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Geen woning gekoppeld</p>
              <p className="mt-1 text-sm text-gray-400">
                Voeg een Realworks ID toe via{" "}
                <button onClick={openEdit} className="text-primary underline hover:no-underline">
                  Project bewerken
                </button>{" "}
                om de woning van de website te koppelen.
              </p>
            </div>
          ) : woningLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-16">
              <p className="text-gray-400">Woning laden...</p>
            </div>
          ) : woningError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-700">{woningError}</p>
              <p className="mt-1 text-xs text-red-500">Realworks ID: {project.realworksId}</p>
              <button
                onClick={() => fetchWoning(project.realworksId!)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Opnieuw proberen
              </button>
            </div>
          ) : woning ? (
            <div className="grid grid-cols-3 gap-4">
              {/* Foto + basis info */}
              <div className="col-span-2 space-y-4">
                {/* Foto */}
                {woning.featuredImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={woning.featuredImage}
                    alt={woning.title}
                    className="w-full rounded-xl object-cover shadow-sm"
                    style={{ maxHeight: 280 }}
                  />
                )}

                {/* Titel + link */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{woning.title}</h3>
                      {woning.acf.adres && (
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                          <MapPinIcon className="h-4 w-4 shrink-0" />
                          {woning.acf.adres}{woning.acf.postcode ? `, ${woning.acf.postcode}` : ""}{woning.acf.plaats ? ` ${woning.acf.plaats}` : ""}
                        </p>
                      )}
                    </div>
                    <a
                      href={woning.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      Bekijk op website
                    </a>
                  </div>

                  {/* Kenmerken grid */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {woning.acf.woonoppervlakte && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Woonoppervlakte</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.woonoppervlakte} m²</p>
                      </div>
                    )}
                    {woning.acf.perceeloppervlakte && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Perceel</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.perceeloppervlakte} m²</p>
                      </div>
                    )}
                    {woning.acf.kamers && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Kamers</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.kamers}</p>
                      </div>
                    )}
                    {woning.acf.slaapkamers && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Slaapkamers</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.slaapkamers}</p>
                      </div>
                    )}
                    {woning.acf.bouwjaar && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Bouwjaar</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.bouwjaar}</p>
                      </div>
                    )}
                    {woning.acf.energielabel && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Energielabel</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.energielabel}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Rechter kolom: status + prijs */}
              <div className="space-y-4">
                {/* Status wijzigen */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Status op website</p>
                  <div className="space-y-1.5">
                    {["Beschikbaar", "Onder bod", "Verkocht o.v.", "Verkocht", "Verhuurd"].map((status) => {
                      const isActive = woning.acf.woning_status === status;
                      return (
                        <button
                          key={status}
                          onClick={() => !isActive && handleWoningStatusChange(status)}
                          disabled={woningStatusSaving}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-white"
                              : "border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          }`}
                        >
                          {status}
                          {isActive && <CheckIcon className="h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                  {woningStatusMessage && (
                    <p className={`mt-2 text-xs ${woningStatusMessage.includes("Fout") || woningStatusMessage.includes("fout") ? "text-red-600" : "text-green-600"}`}>
                      {woningStatusMessage}
                    </p>
                  )}
                  <button
                    onClick={() => fetchWoning(project.realworksId!)}
                    disabled={woningLoading}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    Vernieuwen
                  </button>
                </div>

                {/* Prijs */}
                {(woning.acf.koopsom || woning.acf.huurprijs) && (
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Prijs</p>
                    {woning.acf.koopsom && (
                      <p className="text-lg font-bold text-gray-900">
                        € {Number(woning.acf.koopsom).toLocaleString("nl-NL")}
                      </p>
                    )}
                    {woning.acf.huurprijs && (
                      <p className="text-sm text-gray-600">
                        Huur: € {Number(woning.acf.huurprijs).toLocaleString("nl-NL")} /mnd
                      </p>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Informatie</p>
                  <dl className="space-y-1.5 text-sm">
                    {woning.acf.soort_woning && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Type</dt>
                        <dd className="font-medium text-gray-900">{woning.acf.soort_woning}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Realworks ID</dt>
                      <dd className="font-mono text-xs text-gray-700">{woning.acf.realworks_id || project.realworksId}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">WordPress ID</dt>
                      <dd className="font-mono text-xs text-gray-700">{woning.id}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ===== NOTITIE MODAL ===== */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftEllipsisIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">Notities — {noteCallName}</h2>
              </div>
              <button onClick={() => setShowNoteModal(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-4">
              <form onSubmit={handleSaveNote} className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Schrijf een notitie over dit gesprek..."
                  rows={3}
                  className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={noteSaving || !newNote.trim()}
                  className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {noteSaving ? "..." : "Opslaan"}
                </button>
              </form>
            </div>

            <div className="max-h-72 overflow-y-auto border-t border-gray-100 px-6 py-4">
              {notesLoading ? (
                <p className="text-center text-sm text-gray-400">Laden...</p>
              ) : notes.length === 0 ? (
                <p className="text-center text-sm text-gray-400">Nog geen notities voor dit gesprek</p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 whitespace-pre-wrap text-gray-800">{n.note}</p>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          className="mt-0.5 shrink-0 text-gray-300 transition-colors hover:text-red-500"
                          title="Verwijderen"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {n.createdBy} · {new Date(n.createdAt).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-100 px-6 py-3">
              <button onClick={() => setShowNoteModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONTACT DETAIL PANEL ===== */}
      {showContactPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowContactPanel(false)} />
          <div className="w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-2">
                <UserCircleIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">Contact details</h2>
              </div>
              <button onClick={() => setShowContactPanel(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {contactDetailLoading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-gray-400">Laden...</p>
              </div>
            ) : !contactDetail ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-gray-400">Contact niet gevonden</p>
              </div>
            ) : (
              <div className="space-y-6 px-6 py-4">
                {/* Naam & punten */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {[contactDetail.firstname, contactDetail.lastname].filter(Boolean).join(" ") || "Onbekend"}
                    </h3>
                    {contactDetail.company && (
                      <p className="text-sm text-gray-500">{contactDetail.company}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                      {contactDetail.points} pts
                    </span>
                    <a
                      href={`${MAUTIC_URL}/s/contacts/view/${contactDetail.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
                      title="Openen in Mautic"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                  </div>
                </div>

                {/* Tags */}
                {contactDetail.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {contactDetail.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Contactgegevens */}
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Contactgegevens</p>
                    {!editingContact ? (
                      <button
                        onClick={() => setEditingContact(true)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
                      >
                        <PencilIcon className="h-3 w-3" />
                        Bewerken
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {contactEditMessage && (
                          <span className={`text-xs ${contactEditMessage.includes("Fout") ? "text-red-500" : "text-green-600"}`}>
                            {contactEditMessage}
                          </span>
                        )}
                        <button onClick={() => { setEditingContact(false); setContactEditMessage(""); }} className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                          Annuleren
                        </button>
                        <button
                          onClick={handleSaveContactFields}
                          disabled={contactEditSaving}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                        >
                          <CheckIcon className="h-3 w-3" />
                          {contactEditSaving ? "..." : "Opslaan"}
                        </button>
                      </div>
                    )}
                  </div>

                  {(
                    [
                      { label: "Voornaam", field: "firstname" as const, type: "text" },
                      { label: "Achternaam", field: "lastname" as const, type: "text" },
                      { label: "Bedrijf", field: "company" as const, type: "text" },
                      { label: "E-mail", field: "email" as const, type: "email" },
                      { label: "Telefoon", field: "phone" as const, type: "tel" },
                      { label: "Mobiel", field: "mobile" as const, type: "tel" },
                      { label: "Website", field: "website" as const, type: "url" },
                      { label: "Adres", field: "address1" as const, type: "text" },
                      { label: "Postcode", field: "zipcode" as const, type: "text" },
                      { label: "Stad", field: "city" as const, type: "text" },
                      { label: "Land", field: "country" as const, type: "text" },
                    ] as { label: string; field: keyof typeof contactEditData; type: string }[]
                  ).map(({ label, field, type }) => {
                    const displayValue = (contactDetail as unknown as Record<string, string | null>)[field];
                    if (!editingContact && !displayValue) return null;
                    return (
                      <div key={field} className="grid grid-cols-3 items-center px-4 py-2 text-sm">
                        <span className="text-xs text-gray-500">{label}</span>
                        {editingContact ? (
                          <input
                            type={type}
                            value={contactEditData[field]}
                            onChange={(e) => setContactEditData((prev) => ({ ...prev, [field]: e.target.value }))}
                            className="col-span-2 rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                            placeholder={label}
                          />
                        ) : (
                          <span className="col-span-2 break-all text-gray-900">
                            {field === "email" ? (
                              <a href={`mailto:${displayValue}`} className="text-primary hover:underline">{displayValue}</a>
                            ) : field === "website" ? (
                              <a href={displayValue!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{displayValue}</a>
                            ) : displayValue}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-3 px-4 py-2 text-sm">
                    <span className="text-xs text-gray-500">Toegevoegd</span>
                    <span className="col-span-2 text-gray-900">{formatDateFull(contactDetail.dateAdded)}</span>
                  </div>
                  {contactDetail.lastActive && (
                    <div className="grid grid-cols-3 px-4 py-2 text-sm">
                      <span className="text-xs text-gray-500">Laatste actie</span>
                      <span className="col-span-2 text-gray-900">{formatDateFull(contactDetail.lastActive)}</span>
                    </div>
                  )}
                </div>

                <a
                  href={`${MAUTIC_URL}/s/contacts/view/${contactDetail.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Volledig profiel in Mautic
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== EDIT PROJECT MODAL ===== */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Project bewerken</h2>
              <button onClick={() => setShowEdit(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSave}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Projectnaam *</label>
                <input type="text" required value={editData.name} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
                <textarea value={editData.description} onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))} rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                  <select value={editData.status} onChange={(e) => setEditData((d) => ({ ...d, status: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="lead">Lead</option>
                    <option value="actief">Actief</option>
                    <option value="afgerond">Afgerond</option>
                    <option value="geannuleerd">Geannuleerd</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Adres</label>
                  <input type="text" value={editData.address} onChange={(e) => setEditData((d) => ({ ...d, address: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Realworks ID</label>
                <input
                  type="text"
                  value={editData.realworksId}
                  onChange={(e) => setEditData((d) => ({ ...d, realworksId: e.target.value }))}
                  placeholder="bijv. 123456"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">Koppelt dit project aan de woning op de website via het Realworks ID</p>
              </div>
              <div className="mb-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Contactgegevens</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Naam</label>
                    <input type="text" value={editData.contactName} onChange={(e) => setEditData((d) => ({ ...d, contactName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Telefoon</label>
                    <input type="tel" value={editData.contactPhone} onChange={(e) => setEditData((d) => ({ ...d, contactPhone: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
                    <input type="email" value={editData.contactEmail} onChange={(e) => setEditData((d) => ({ ...d, contactEmail: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowEdit(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  Annuleren
                </button>
                <button type="submit" disabled={editSaving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
                  {editSaving ? "Opslaan..." : "Opslaan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== NIEUWE TAAK MODAL ===== */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nieuwe taak voor {project.name}</h2>
              <button onClick={() => setShowNewTask(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Titel *</label>
                <input type="text" required value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Wat moet er gedaan worden?" />
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
                <textarea value={newTask.description} onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))} rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Toewijzen aan *</label>
                  <select required value={newTask.assigneeId} onChange={(e) => setNewTask((t) => ({ ...t, assigneeId: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">Selecteer...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Prioriteit</label>
                  <select value={newTask.priority} onChange={(e) => setNewTask((t) => ({ ...t, priority: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none">
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
                  <select value={newTask.category} onChange={(e) => setNewTask((t) => ({ ...t, category: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">Geen</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Deadline</label>
                  <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask((t) => ({ ...t, dueDate: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowNewTask(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                  Annuleren
                </button>
                <button type="submit" disabled={taskSaving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50">
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
