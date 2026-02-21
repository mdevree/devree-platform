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
  DocumentTextIcon,
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
    status?: string;           // "Beschikbaar", "Verkocht o.v.", "Verkocht", "Verhuurd", "Onder bod"
    koopsom?: number;
    koopprijs_label?: string;
    huurprijs?: number;
    koopconditie?: string;
    aanvaarding?: string;
    woonoppervlakte?: number;
    kadastrale_oppervlakte?: number;
    inhoud?: number;
    aantal_kamers?: number;
    bouwjaar?: string;
    bouwvorm?: string;
    energieklasse?: string;
    straat?: string;
    huisnummer?: string;
    postcode?: string;
    plaats?: string;
    wijk?: string;
    realworks_id?: string;
    intro_tekst_ai?: string;
    floorplanner_fml?: string;
    tour_360_url?: string;
    woning_video_url?: string;
    isolatievormen?: string;
    verwarming?: string;
    voorzieningen?: string;
    ligging?: string;
    coordinaten_x?: string;
    coordinaten_y?: string;
    [key: string]: unknown;
  };
}

interface ProjectContact {
  id: string;
  mauticContactId: number;
  role: string;
  label: string | null;
  addedAt: string;
  // Verrijkt na ophalen uit Mautic
  name?: string;
  points?: number;
  lastActive?: string | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string; // legacy
  projectStatus: string | null; // nieuw
  verkoopstart: string | null;
  startdatum: string | null;
  startReden: string | null;
  address: string | null;
  // Woning
  woningAdres: string | null;
  woningPostcode: string | null;
  woningPlaats: string | null;
  kadGemeente: string | null;
  kadSectie: string | null;
  kadNummer: string | null;
  woningOppervlakte: string | null;
  // Commercieel
  vraagprijs: number | null;
  courtagePercentage: string | null;
  verkoopmethode: string | null;
  bijzondereAfspraken: string | null;
  // Kosten
  kostenPubliciteit: number | null;
  kostenEnergielabel: number | null;
  kostenJuridisch: number | null;
  kostenBouwkundig: number | null;
  kostenIntrekking: number | null;
  kostenBedenktijd: number | null;
  // Overig
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notionPageId: string | null;
  mauticContactId: number | null;
  realworksId: string | null;
  contacts: ProjectContact[];
  tasks: Task[];
  calls: Call[];
  createdAt: string;
  updatedAt: string;
}

type ActiveTab = "taken" | "telefonie" | "woning" | "dossier";

interface MauticEvent {
  id: string;
  mauticContactId: number;
  eventType: string;
  emailName: string | null;
  clickedUrl: string | null;
  occurredAt: string;
}

function EmailActivitySection({ contactId }: { contactId: number }) {
  const [events, setEvents] = useState<MauticEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/mautic/events?contactId=${contactId}&limit=10`)
      .then((r) => r.json())
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [contactId]);

  const hasRecentClick = events.some((e) => {
    if (e.eventType !== "email.click") return false;
    const daysSince = (Date.now() - new Date(e.occurredAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince < 14;
  });

  if (loading) {
    return (
      <div className="mb-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Email activiteit</p>
        <p className="text-xs text-gray-400">Laden...</p>
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Email activiteit</p>
      {hasRecentClick && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          Actief in de afgelopen 2 weken
        </div>
      )}
      <div className="space-y-1">
        {events.map((event) => {
          const daysSince = Math.floor((Date.now() - new Date(event.occurredAt).getTime()) / (1000 * 60 * 60 * 24));
          const timeLabel = daysSince === 0 ? "Vandaag" : daysSince === 1 ? "Gisteren" : `${daysSince} dagen geleden`;
          const isClick = event.eventType === "email.click";
          return (
            <div key={event.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-gray-50">
              <span className={`mt-0.5 flex-shrink-0 rounded-full px-1.5 py-0.5 font-medium ${isClick ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                {isClick ? "Click" : "Open"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-700">{event.emailName || "Email"}</p>
                {event.clickedUrl && (
                  <p className="truncate text-gray-400">{event.clickedUrl}</p>
                )}
              </div>
              <span className="flex-shrink-0 text-gray-400">{timeLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getProjectStatusLabel(project: Project): string {
  if (project.projectStatus && STATUS_LABELS[project.projectStatus]) {
    return STATUS_LABELS[project.projectStatus];
  }
  const legacyMap: Record<string, string> = {
    lead: "Lead", actief: "Actief", afgerond: "Afgerond", geannuleerd: "Geannuleerd",
  };
  return legacyMap[project.status] || project.status;
}

function getProjectStatusColor(project: Project): string {
  if (project.projectStatus && STATUS_COLORS[project.projectStatus]) {
    return `${STATUS_COLORS[project.projectStatus]} border border-transparent`;
  }
  const legacyMap: Record<string, string> = {
    lead: "bg-gray-100 text-gray-600 border-gray-200",
    actief: "bg-green-100 text-green-700 border-green-200",
    afgerond: "bg-gray-100 text-gray-600 border-gray-200",
    geannuleerd: "bg-red-100 text-red-600 border-red-200",
  };
  return legacyMap[project.status] || "bg-gray-100 text-gray-600 border-gray-200";
}

function StatusProgressBar({ project }: { project: Project }) {
  const flow = STATUS_FLOW[project.type || "VERKOOP"] || STATUS_FLOW.VERKOOP;
  const currentStatus = project.projectStatus;
  if (!currentStatus) return null;
  const currentIndex = flow.indexOf(currentStatus);
  if (currentIndex === -1) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {flow.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step} className="flex shrink-0 items-center gap-1">
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                isCurrent
                  ? `${STATUS_COLORS[step] || "bg-primary/10 text-primary"} ring-1 ring-current`
                  : isDone
                  ? "bg-green-50 text-green-600"
                  : "bg-gray-50 text-gray-400"
              }`}>
                {isDone && <CheckIcon className="h-2.5 w-2.5" />}
                {STATUS_LABELS[step] || step}
              </div>
              {i < flow.length - 1 && (
                <div className={`h-0.5 w-3 rounded ${isDone ? "bg-green-300" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
    // Nieuw
    type: "VERKOOP", projectStatus: "LEAD",
    verkoopstart: "", startdatum: "", startReden: "",
    woningAdres: "", woningPostcode: "", woningPlaats: "",
    kadGemeente: "", kadSectie: "", kadNummer: "", woningOppervlakte: "",
    vraagprijs: "", courtagePercentage: "", verkoopmethode: "", bijzondereAfspraken: "",
    kostenPubliciteit: "", kostenEnergielabel: "", kostenJuridisch: "",
    kostenBouwkundig: "", kostenIntrekking: "", kostenBedenktijd: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [showEditWoning, setShowEditWoning] = useState(false);
  const [showEditCommercieel, setShowEditCommercieel] = useState(false);

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

  // Contact koppelen aan project
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactSearchResults, setContactSearchResults] = useState<Array<{ id: number; firstname: string; lastname: string; email: string | null; phone: string | null; points: number }>>([]);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [contactLinkSaving, setContactLinkSaving] = useState(false);

  // Samenvoegen (merge) modal
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeSearchResults, setMergeSearchResults] = useState<Array<{
    id: string; name: string; status: string; address: string | null;
    _count: { tasks: number; calls: number };
  }>>([]);
  const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    source: { id: string; name: string; status: string };
    target: { id: string; name: string; status: string };
    tasksToTransfer: number;
    callsToTransfer: number;
    contactsToTransfer: number;
    contactsAlreadyLinked: number;
    metadataFieldsToFill: string[];
  } | null>(null);
  const [mergePreviewLoading, setMergePreviewLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState("");

  // Verrijkte contact namen (geladen na project fetch)
  const [enrichedContacts, setEnrichedContacts] = useState<Record<number, { name: string; points: number; lastActive: string | null }>>({});

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
        body: JSON.stringify({ wpPostId: woning.id, acf: { status: newStatus } }),
      });
      const data = await res.json();
      if (data.success) {
        setWoning((prev) => prev ? { ...prev, acf: { ...prev.acf, status: newStatus } } : prev);
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
      // Nieuw
      type: project.type || "VERKOOP",
      projectStatus: project.projectStatus || "LEAD",
      verkoopstart: project.verkoopstart || "",
      startdatum: project.startdatum ? project.startdatum.split("T")[0] : "",
      startReden: project.startReden || "",
      woningAdres: project.woningAdres || "",
      woningPostcode: project.woningPostcode || "",
      woningPlaats: project.woningPlaats || "",
      kadGemeente: project.kadGemeente || "",
      kadSectie: project.kadSectie || "",
      kadNummer: project.kadNummer || "",
      woningOppervlakte: project.woningOppervlakte || "",
      vraagprijs: project.vraagprijs != null ? String(project.vraagprijs) : "",
      courtagePercentage: project.courtagePercentage || "",
      verkoopmethode: project.verkoopmethode || "",
      bijzondereAfspraken: project.bijzondereAfspraken || "",
      kostenPubliciteit: project.kostenPubliciteit != null ? String(project.kostenPubliciteit) : "",
      kostenEnergielabel: project.kostenEnergielabel != null ? String(project.kostenEnergielabel) : "",
      kostenJuridisch: project.kostenJuridisch != null ? String(project.kostenJuridisch) : "",
      kostenBouwkundig: project.kostenBouwkundig != null ? String(project.kostenBouwkundig) : "",
      kostenIntrekking: project.kostenIntrekking != null ? String(project.kostenIntrekking) : "",
      kostenBedenktijd: project.kostenBedenktijd != null ? String(project.kostenBedenktijd) : "",
    });
    setShowEdit(true);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    try {
      const intOrNull = (v: string) => v ? parseInt(v) : null;
      const response = await fetch("/api/projecten", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          ...editData,
          realworksId: editData.realworksId || null,
          verkoopstart: editData.verkoopstart || null,
          startdatum: editData.startdatum || null,
          startReden: editData.startReden || null,
          vraagprijs: intOrNull(editData.vraagprijs),
          kostenPubliciteit: intOrNull(editData.kostenPubliciteit),
          kostenEnergielabel: intOrNull(editData.kostenEnergielabel),
          kostenJuridisch: intOrNull(editData.kostenJuridisch),
          kostenBouwkundig: intOrNull(editData.kostenBouwkundig),
          kostenIntrekking: intOrNull(editData.kostenIntrekking),
          kostenBedenktijd: intOrNull(editData.kostenBedenktijd),
          verkoopmethode: editData.verkoopmethode || null,
        }),
      });
      if (response.ok) {
        setShowEdit(false);
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

  // --- Contact zoeken voor koppelen ---
  async function handleContactSearch(query: string) {
    setContactSearch(query);
    if (query.trim().length < 2) { setContactSearchResults([]); return; }
    setContactSearchLoading(true);
    try {
      const res = await fetch(`/api/mautic/contacts?search=${encodeURIComponent(query)}&limit=8`);
      const data = await res.json();
      setContactSearchResults(data.contacts || []);
    } catch { setContactSearchResults([]); }
    setContactSearchLoading(false);
  }

  async function handleLinkContact(mauticContactId: number, role: string = "opdrachtgever") {
    setContactLinkSaving(true);
    try {
      const res = await fetch(`/api/projecten/${projectId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mauticContactId, role }),
      });
      if (res.ok) {
        setShowAddContact(false);
        setContactSearch("");
        setContactSearchResults([]);
        fetchProject();
      }
    } catch { console.error("Fout bij koppelen contact"); }
    setContactLinkSaving(false);
  }

  async function handleUnlinkContact(mauticContactId: number) {
    try {
      await fetch(`/api/projecten/${projectId}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mauticContactId }),
      });
      fetchProject();
    } catch { console.error("Fout bij ontkoppelen contact"); }
  }

  // --- Samenvoegen ---
  async function handleMergeSearch(query: string) {
    setMergeSearch(query);
    if (query.trim().length < 2) {
      setMergeSearchResults([]);
      return;
    }
    setMergeSearchLoading(true);
    try {
      const res = await fetch(
        `/api/projecten?search=${encodeURIComponent(query)}&limit=8`
      );
      const data = await res.json();
      setMergeSearchResults(
        (data.projects || []).filter(
          (p: { id: string }) => p.id !== projectId
        )
      );
    } catch {
      setMergeSearchResults([]);
    }
    setMergeSearchLoading(false);
  }

  async function handleMergeSelect(targetId: string) {
    setMergeTargetId(targetId);
    setMergePreview(null);
    setMergePreviewLoading(true);
    setMergeError("");
    try {
      const res = await fetch(
        `/api/projecten/merge?sourceId=${projectId}&targetId=${targetId}`
      );
      const data = await res.json();
      if (data.preview) {
        setMergePreview(data.preview);
      } else {
        setMergeError(data.error || "Kan preview niet laden");
      }
    } catch {
      setMergeError("Netwerkfout");
    }
    setMergePreviewLoading(false);
  }

  async function handleMergeConfirm() {
    if (!mergeTargetId) return;
    setMerging(true);
    setMergeError("");
    try {
      const res = await fetch("/api/projecten/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: projectId, targetId: mergeTargetId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/projecten/${mergeTargetId}`);
      } else {
        setMergeError(data.error || "Fout bij samenvoegen");
      }
    } catch {
      setMergeError("Netwerkfout");
    }
    setMerging(false);
  }

  // Verrijk contact namen na project laden
  useEffect(() => {
    if (!project?.contacts?.length) return;
    const toFetch = project.contacts.filter((c) => !enrichedContacts[c.mauticContactId]);
    if (!toFetch.length) return;
    toFetch.forEach(async (c) => {
      try {
        const res = await fetch(`/api/mautic/contact?id=${c.mauticContactId}`);
        const data = await res.json();
        if (data.contact) {
          setEnrichedContacts((prev) => ({
            ...prev,
            [c.mauticContactId]: {
              name: `${data.contact.firstname} ${data.contact.lastname}`.trim() || `Contact #${c.mauticContactId}`,
              points: data.contact.points || 0,
              lastActive: data.contact.lastActive || null,
            },
          }));
        }
      } catch { /* stil falen */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.contacts]);

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
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${
              project.type === "AANKOOP" ? "bg-green-50" :
              project.type === "TAXATIE" ? "bg-purple-50" :
              "bg-blue-50"
            }`}>
              <FolderIcon className={`h-6 w-6 ${
                project.type === "AANKOOP" ? "text-green-600" :
                project.type === "TAXATIE" ? "text-purple-600" :
                "text-blue-600"
              }`} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${PROJECT_TYPE_COLORS[project.type || "VERKOOP"] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {PROJECT_TYPE_LABELS[project.type || "VERKOOP"] || project.type}
                </span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getProjectStatusColor(project)}`}>
                  {getProjectStatusLabel(project)}
                </span>
              </div>
              {(project.woningAdres || project.address) && (
                <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                  <MapPinIcon className="h-4 w-4" />
                  {project.woningAdres || project.address}
                  {project.woningPostcode && ` · ${project.woningPostcode}`}
                  {project.woningPlaats && ` ${project.woningPlaats}`}
                </p>
              )}
              {project.description && (
                <p className="mt-2 text-sm text-gray-600">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowMerge(true);
                setMergeSearch("");
                setMergeSearchResults([]);
                setMergeTargetId(null);
                setMergePreview(null);
                setMergeError("");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Samenvoegen
            </button>
            <button
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <PencilIcon className="h-4 w-4" />
              Bewerken
            </button>
          </div>
        </div>

        {/* Contacten sectie */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Contacten</p>
            <button
              onClick={() => setShowAddContact(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Toevoegen
            </button>
          </div>

          {/* Gekoppelde Mautic contacten */}
          {project.contacts && project.contacts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {project.contacts.map((c) => {
                const info = enrichedContacts[c.mauticContactId];
                const name = info?.name || `Contact #${c.mauticContactId}`;
                const points = info?.points ?? 0;
                const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                const pointsColor = points >= 50 ? "bg-green-100 text-green-700" : points >= 20 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600";
                return (
                  <div key={c.id} className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm transition-shadow hover:shadow">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {initials}
                    </div>
                    <div>
                      <button
                        onClick={() => openContactPanel(c.mauticContactId)}
                        className="text-sm font-medium text-gray-900 hover:text-primary hover:underline"
                      >
                        {info ? name : <span className="animate-pulse text-gray-400">Laden...</span>}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs capitalize text-gray-400">{c.role}</span>
                        {info && (
                          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ${pointsColor}`}>
                            {points} pts
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <a
                        href={`${MAUTIC_URL}/s/contacts/view/${c.mauticContactId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        title="Open in Mautic"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => handleUnlinkContact(c.mauticContactId)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Ontkoppelen"
                      >
                        <LinkSlashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback: toon legacy contactvelden als er geen gekoppelde contacten zijn */
            <div className="flex flex-wrap items-center gap-6">
              {project.contactName && (
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <UserIcon className="h-4 w-4 text-gray-400" />
                  {project.contactName}
                </span>
              )}
              {project.contactPhone && (
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <PhoneIcon className="h-4 w-4 text-gray-400" />
                  {project.contactPhone}
                </span>
              )}
              {project.contactEmail && (
                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                  <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                  {project.contactEmail}
                </span>
              )}
              {!project.contactName && !project.contactPhone && !project.contactEmail && (
                <p className="text-sm text-gray-400">Nog geen contacten gekoppeld</p>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="mt-3 text-xs text-gray-400">
            {openTasks} open, {completedTasks} afgerond · {project.calls.length} gesprekken
          </div>
        </div>

        {/* Statusvoortgangsbalk */}
        <StatusProgressBar project={project} />

        {/* Contact toevoegen dropdown */}
        {showAddContact && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Contact zoeken & koppelen</p>
              <button onClick={() => { setShowAddContact(false); setContactSearch(""); setContactSearchResults([]); }}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-200">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => handleContactSearch(e.target.value)}
              placeholder="Zoek op naam, email of telefoon..."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              autoFocus
            />
            {contactSearchLoading && <p className="mt-2 text-xs text-gray-400">Zoeken...</p>}
            {contactSearchResults.length > 0 && (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
                {contactSearchResults.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.firstname} {c.lastname}</p>
                      <p className="text-xs text-gray-400">{c.email || c.phone || ""}</p>
                    </div>
                    <button
                      onClick={() => handleLinkContact(c.id)}
                      disabled={contactLinkSaving || project.contacts.some((pc) => pc.mauticContactId === c.id)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                    >
                      {project.contacts.some((pc) => pc.mauticContactId === c.id) ? "Gekoppeld" : "Koppelen"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {contactSearch.length >= 2 && !contactSearchLoading && contactSearchResults.length === 0 && (
              <p className="mt-2 text-xs text-gray-400">Geen contacten gevonden</p>
            )}
          </div>
        )}
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
        <button
          onClick={() => setActiveTab("dossier")}
          className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            activeTab === "dossier" ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <DocumentTextIcon className="h-4 w-4" />
          Dossier
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
                      {(woning.acf.straat || woning.acf.plaats) && (
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
                          <MapPinIcon className="h-4 w-4 shrink-0" />
                          {[woning.acf.straat, woning.acf.huisnummer].filter(Boolean).join(" ")}
                          {woning.acf.postcode ? `, ${woning.acf.postcode}` : ""}
                          {woning.acf.plaats ? ` ${woning.acf.plaats}` : ""}
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
                    {!!woning.acf.woonoppervlakte && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Woonoppervlakte</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.woonoppervlakte} m²</p>
                      </div>
                    )}
                    {!!woning.acf.kadastrale_oppervlakte && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Perceel</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.kadastrale_oppervlakte} m²</p>
                      </div>
                    )}
                    {!!woning.acf.inhoud && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Inhoud</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.inhoud} m³</p>
                      </div>
                    )}
                    {!!woning.acf.aantal_kamers && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Kamers</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.aantal_kamers}</p>
                      </div>
                    )}
                    {woning.acf.bouwjaar && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Bouwjaar</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.bouwjaar}</p>
                      </div>
                    )}
                    {woning.acf.energieklasse && (
                      <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                        <p className="text-xs text-gray-500">Energielabel</p>
                        <p className="mt-0.5 text-sm font-semibold text-gray-900">{woning.acf.energieklasse}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Extra details */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Details</p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {woning.acf.bouwvorm && (
                      <><dt className="text-gray-500">Bouwvorm</dt><dd className="font-medium text-gray-900">{woning.acf.bouwvorm}</dd></>
                    )}
                    {woning.acf.koopconditie && (
                      <><dt className="text-gray-500">Conditie</dt><dd className="font-medium text-gray-900">{woning.acf.koopconditie}</dd></>
                    )}
                    {woning.acf.aanvaarding && (
                      <><dt className="text-gray-500">Aanvaarding</dt><dd className="font-medium text-gray-900">{woning.acf.aanvaarding}</dd></>
                    )}
                    {woning.acf.verwarming && (
                      <><dt className="text-gray-500">Verwarming</dt><dd className="font-medium text-gray-900">{woning.acf.verwarming}</dd></>
                    )}
                    {woning.acf.ligging && (
                      <><dt className="text-gray-500">Ligging</dt><dd className="font-medium text-gray-900">{woning.acf.ligging}</dd></>
                    )}
                    {woning.acf.isolatievormen && (
                      <><dt className="text-gray-500">Isolatie</dt><dd className="font-medium text-gray-900">{woning.acf.isolatievormen}</dd></>
                    )}
                    {woning.acf.voorzieningen && (
                      <><dt className="text-gray-500">Voorzieningen</dt><dd className="font-medium text-gray-900">{woning.acf.voorzieningen}</dd></>
                    )}
                    {woning.acf.wijk && (
                      <><dt className="text-gray-500">Wijk</dt><dd className="font-medium text-gray-900">{woning.acf.wijk}</dd></>
                    )}
                  </dl>
                </div>

                {/* Extra links */}
                {(woning.acf.floorplanner_fml || woning.acf.tour_360_url || woning.acf.woning_video_url) && (
                  <div className="flex flex-wrap gap-2">
                    {woning.acf.floorplanner_fml && (
                      <a href={woning.acf.floorplanner_fml} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        Plattegrond
                      </a>
                    )}
                    {woning.acf.tour_360_url && (
                      <a href={woning.acf.tour_360_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        360° tour
                      </a>
                    )}
                    {woning.acf.woning_video_url && (
                      <a href={woning.acf.woning_video_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        Video
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Rechter kolom: status + prijs */}
              <div className="space-y-4">
                {/* Status wijzigen */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Status op website</p>
                  <div className="space-y-1.5">
                    {["Beschikbaar", "Onder bod", "Verkocht onder voorbehoud", "Verkocht"].map((status) => {
                      const isActive = woning.acf.status === status;
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
                    {woning.acf.koopprijs_label ? (
                      <p className="text-base font-bold text-gray-900">{woning.acf.koopprijs_label}</p>
                    ) : woning.acf.koopsom ? (
                      <p className="text-lg font-bold text-gray-900">
                        € {woning.acf.koopsom.toLocaleString("nl-NL")}
                      </p>
                    ) : null}
                    {woning.acf.huurprijs && (
                      <p className="text-sm text-gray-600">
                        Huur: € {woning.acf.huurprijs.toLocaleString("nl-NL")} /mnd
                      </p>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Informatie</p>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Realworks ID</dt>
                      <dd className="font-mono text-xs text-gray-700">{woning.acf.realworks_id || project.realworksId}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">WordPress ID</dt>
                      <dd className="font-mono text-xs text-gray-700">{woning.id}</dd>
                    </div>
                    {woning.acf.coordinaten_x && woning.acf.coordinaten_y && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Coördinaten</dt>
                        <dd className="font-mono text-xs text-gray-700">
                          <a
                            href={`https://maps.google.com/?q=${woning.acf.coordinaten_y},${woning.acf.coordinaten_x}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Bekijk op kaart
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ===== DOSSIER TAB ===== */}
      {activeTab === "dossier" && (
        <div className="space-y-4">
          {/* Opdracht */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Opdracht</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-gray-500">Type</dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${PROJECT_TYPE_COLORS[project.type || "VERKOOP"] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                    {PROJECT_TYPE_LABELS[project.type || "VERKOOP"] || project.type}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd className="mt-0.5 font-medium text-gray-900">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getProjectStatusColor(project)}`}>
                    {getProjectStatusLabel(project)}
                  </span>
                </dd>
              </div>
              {project.verkoopstart && (
                <div>
                  <dt className="text-xs text-gray-500">Verkoopstart</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{VERKOOPSTART_LABELS[project.verkoopstart] || project.verkoopstart}</dd>
                </div>
              )}
              {project.startdatum && (
                <div>
                  <dt className="text-xs text-gray-500">Startdatum</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{formatDateFull(project.startdatum)}</dd>
                </div>
              )}
              {project.startReden && (
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500">Reden uitgesteld / slapend</dt>
                  <dd className="mt-0.5 text-gray-900">{project.startReden}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Woning */}
          {(project.woningAdres || project.kadGemeente || project.woningOppervlakte) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Woning</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                {project.woningAdres && (
                  <div>
                    <dt className="text-xs text-gray-500">Adres</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.woningAdres}</dd>
                  </div>
                )}
                {project.woningPostcode && (
                  <div>
                    <dt className="text-xs text-gray-500">Postcode</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.woningPostcode}</dd>
                  </div>
                )}
                {project.woningPlaats && (
                  <div>
                    <dt className="text-xs text-gray-500">Plaats</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.woningPlaats}</dd>
                  </div>
                )}
                {project.kadGemeente && (
                  <div>
                    <dt className="text-xs text-gray-500">Kadastrale gemeente</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.kadGemeente}</dd>
                  </div>
                )}
                {project.kadSectie && (
                  <div>
                    <dt className="text-xs text-gray-500">Sectie</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.kadSectie}</dd>
                  </div>
                )}
                {project.kadNummer && (
                  <div>
                    <dt className="text-xs text-gray-500">Perceelnummer</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.kadNummer}</dd>
                  </div>
                )}
                {project.woningOppervlakte && (
                  <div>
                    <dt className="text-xs text-gray-500">Oppervlakte</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.woningOppervlakte}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Commercieel */}
          {(project.vraagprijs || project.courtagePercentage || project.verkoopmethode || project.bijzondereAfspraken) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Commercieel</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                {project.vraagprijs != null && (
                  <div>
                    <dt className="text-xs text-gray-500">Vraagprijs</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">€ {project.vraagprijs.toLocaleString("nl-NL")}</dd>
                  </div>
                )}
                {project.courtagePercentage && (
                  <div>
                    <dt className="text-xs text-gray-500">Courtage</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{project.courtagePercentage}%</dd>
                  </div>
                )}
                {project.verkoopmethode && (
                  <div>
                    <dt className="text-xs text-gray-500">Verkoopmethode</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{VERKOOPMETHODE_LABELS[project.verkoopmethode] || project.verkoopmethode}</dd>
                  </div>
                )}
                {project.bijzondereAfspraken && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-xs text-gray-500">Bijzondere afspraken</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-gray-900">{project.bijzondereAfspraken}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Kosten */}
          {(project.kostenPubliciteit || project.kostenEnergielabel || project.kostenJuridisch || project.kostenBouwkundig || project.kostenIntrekking || project.kostenBedenktijd) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Kosten</p>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {[
                    { label: "Publiciteit", value: project.kostenPubliciteit },
                    { label: "Energielabel", value: project.kostenEnergielabel },
                    { label: "Juridisch", value: project.kostenJuridisch },
                    { label: "Bouwkundig", value: project.kostenBouwkundig },
                    { label: "Intrekking", value: project.kostenIntrekking },
                    { label: "Bedenktijd", value: project.kostenBedenktijd },
                  ].filter((r) => r.value != null).map((row) => (
                    <tr key={row.label}>
                      <td className="py-2 text-gray-500">{row.label}</td>
                      <td className="py-2 text-right font-medium text-gray-900">€ {row.value!.toLocaleString("nl-NL")}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2 font-semibold text-gray-700">Totaal</td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      € {[project.kostenPubliciteit, project.kostenEnergielabel, project.kostenJuridisch, project.kostenBouwkundig, project.kostenIntrekking, project.kostenBedenktijd]
                          .filter((v): v is number => v != null)
                          .reduce((a, b) => a + b, 0)
                          .toLocaleString("nl-NL")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Geen dossierdata */}
          {!project.woningAdres && !project.kadGemeente && !project.vraagprijs && !project.courtagePercentage && !project.kostenPubliciteit && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <DocumentTextIcon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Nog geen dossiergegevens</p>
              <p className="mt-1 text-sm text-gray-400">
                Voeg woning- en commerciële gegevens toe via{" "}
                <button onClick={openEdit} className="text-primary underline hover:no-underline">
                  Project bewerken
                </button>
              </p>
            </div>
          )}
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

                {/* Email activiteit */}
                <EmailActivitySection contactId={contactDetail.id} />

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Project bewerken</h2>
              <button onClick={() => setShowEdit(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSave} className="px-6 py-5 space-y-5">
              {/* Basis */}
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Basis</p>
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
                    <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                    <div className="flex gap-2">
                      {(["VERKOOP", "AANKOOP", "TAXATIE"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEditData((d) => ({ ...d, type: t }))}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                            editData.type === t
                              ? PROJECT_TYPE_COLORS[t] + " ring-2 ring-offset-1 ring-primary/30"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {PROJECT_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                    <select value={editData.projectStatus} onChange={(e) => setEditData((d) => ({ ...d, projectStatus: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                      {(STATUS_FLOW[editData.type] || STATUS_FLOW.VERKOOP).map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {editData.type === "VERKOOP" && (
                  <div className="mb-3">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Verkoopstart</label>
                    <div className="flex gap-2">
                      {(["DIRECT", "UITGESTELD", "SLAPEND"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setEditData((d) => ({ ...d, verkoopstart: v }))}
                          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            editData.verkoopstart === v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {VERKOOPSTART_LABELS[v]}
                        </button>
                      ))}
                    </div>
                    {(editData.verkoopstart === "UITGESTELD" || editData.verkoopstart === "SLAPEND") && (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Beoogde startdatum</label>
                          <input type="date" value={editData.startdatum} onChange={(e) => setEditData((d) => ({ ...d, startdatum: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Reden</label>
                          <input type="text" value={editData.startReden} onChange={(e) => setEditData((d) => ({ ...d, startReden: e.target.value }))}
                            placeholder="Bijv. verbouwing lopend"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="mb-3">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Realworks ID</label>
                  <input type="text" value={editData.realworksId} onChange={(e) => setEditData((d) => ({ ...d, realworksId: e.target.value }))}
                    placeholder="bijv. 123456"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none" />
                  <p className="mt-1 text-xs text-gray-400">Koppelt dit project aan de woning op de website via het Realworks ID</p>
                </div>
              </div>

              {/* Woning */}
              <div className="border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditWoning((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-600"
                >
                  <span>Woninggegevens</span>
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${showEditWoning ? "rotate-180" : ""}`} />
                </button>
                {showEditWoning && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Adres</label>
                        <input type="text" value={editData.woningAdres} onChange={(e) => setEditData((d) => ({ ...d, woningAdres: e.target.value }))}
                          placeholder="Straat + huisnummer"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Postcode</label>
                        <input type="text" value={editData.woningPostcode} onChange={(e) => setEditData((d) => ({ ...d, woningPostcode: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Plaats</label>
                        <input type="text" value={editData.woningPlaats} onChange={(e) => setEditData((d) => ({ ...d, woningPlaats: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Oppervlakte</label>
                        <input type="text" value={editData.woningOppervlakte} onChange={(e) => setEditData((d) => ({ ...d, woningOppervlakte: e.target.value }))}
                          placeholder="bijv. 120 m²"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Kad. gemeente</label>
                        <input type="text" value={editData.kadGemeente} onChange={(e) => setEditData((d) => ({ ...d, kadGemeente: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Sectie</label>
                        <input type="text" value={editData.kadSectie} onChange={(e) => setEditData((d) => ({ ...d, kadSectie: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Perceelnr.</label>
                        <input type="text" value={editData.kadNummer} onChange={(e) => setEditData((d) => ({ ...d, kadNummer: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Commercieel & Kosten */}
              <div className="border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditCommercieel((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-600"
                >
                  <span>Commercieel & Kosten</span>
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${showEditCommercieel ? "rotate-180" : ""}`} />
                </button>
                {showEditCommercieel && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Vraagprijs (€)</label>
                        <input type="number" value={editData.vraagprijs} onChange={(e) => setEditData((d) => ({ ...d, vraagprijs: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Courtage (%)</label>
                        <input type="text" value={editData.courtagePercentage} onChange={(e) => setEditData((d) => ({ ...d, courtagePercentage: e.target.value }))}
                          placeholder="bijv. 1.2"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                      </div>
                    </div>
                    {editData.type === "VERKOOP" && (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Verkoopmethode</label>
                        <select value={editData.verkoopmethode} onChange={(e) => setEditData((d) => ({ ...d, verkoopmethode: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none">
                          <option value="">Geen keuze</option>
                          {Object.entries(VERKOOPMETHODE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Bijzondere afspraken</label>
                      <textarea value={editData.bijzondereAfspraken} onChange={(e) => setEditData((d) => ({ ...d, bijzondereAfspraken: e.target.value }))} rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-gray-500">Kosten (€)</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Publiciteit", key: "kostenPubliciteit" as const },
                          { label: "Energielabel", key: "kostenEnergielabel" as const },
                          { label: "Juridisch", key: "kostenJuridisch" as const },
                          { label: "Bouwkundig", key: "kostenBouwkundig" as const },
                          { label: "Intrekking", key: "kostenIntrekking" as const },
                          { label: "Bedenktijd", key: "kostenBedenktijd" as const },
                        ].map(({ label, key }) => (
                          <div key={key}>
                            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
                            <input type="number" value={editData[key]} onChange={(e) => setEditData((d) => ({ ...d, [key]: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Contactgegevens */}
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-400">Contactgegevens (legacy)</p>
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

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white pt-4">
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

      {/* Samenvoegen modal */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Project samenvoegen
              </h2>
              <button
                onClick={() => setShowMerge(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-medium">
                Dit project ({project.name}) wordt samengevoegd met een ander
                project.
              </p>
              <p className="mt-1">
                Alle taken, gesprekken en contacten worden verplaatst naar het
                doelproject. Dit project wordt daarna verwijderd.
              </p>
            </div>

            {/* Stap 1: Zoek doelproject */}
            {!mergePreview && !mergePreviewLoading && (
              <>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Zoek het doelproject
                </label>
                <input
                  type="text"
                  value={mergeSearch}
                  onChange={(e) => handleMergeSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Zoek op naam of adres..."
                  autoFocus
                />

                {mergeSearchLoading && (
                  <p className="mt-2 text-xs text-gray-400">Zoeken...</p>
                )}

                {mergeSearchResults.length > 0 && (
                  <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                    {mergeSearchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleMergeSelect(p.id)}
                        className="w-full rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {p.name}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {STATUS_LABELS[p.status] || p.status}
                          </span>
                        </div>
                        {p.address && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {p.address}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          {p._count.tasks} taken, {p._count.calls} gesprekken
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Loading preview */}
            {mergePreviewLoading && (
              <p className="mt-4 text-center text-sm text-gray-400">
                Preview laden...
              </p>
            )}

            {/* Stap 2: Preview */}
            {mergePreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex-1 rounded-lg bg-red-50 p-3 text-center">
                    <p className="text-xs text-gray-500">Wordt verwijderd</p>
                    <p className="font-semibold text-red-700">
                      {mergePreview.source.name}
                    </p>
                  </div>
                  <span className="text-gray-400">&rarr;</span>
                  <div className="flex-1 rounded-lg bg-green-50 p-3 text-center">
                    <p className="text-xs text-gray-500">Blijft behouden</p>
                    <p className="font-semibold text-green-700">
                      {mergePreview.target.name}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-3 text-sm">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                    Wat wordt overgeheveld
                  </p>
                  <ul className="space-y-1 text-gray-700">
                    <li className="flex justify-between">
                      <span>Taken</span>
                      <span className="font-medium">
                        {mergePreview.tasksToTransfer}
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span>Gesprekken</span>
                      <span className="font-medium">
                        {mergePreview.callsToTransfer}
                      </span>
                    </li>
                    <li className="flex justify-between">
                      <span>Contacten</span>
                      <span className="font-medium">
                        {mergePreview.contactsToTransfer}
                        {mergePreview.contactsAlreadyLinked > 0 && (
                          <span className="ml-1 text-xs text-gray-400">
                            ({mergePreview.contactsAlreadyLinked} al gekoppeld)
                          </span>
                        )}
                      </span>
                    </li>
                    {mergePreview.metadataFieldsToFill.length > 0 && (
                      <li className="flex justify-between">
                        <span>Metadata velden</span>
                        <span className="text-xs font-medium">
                          {mergePreview.metadataFieldsToFill.join(", ")}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {mergeError && (
              <p className="mt-2 text-sm text-red-600">{mergeError}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              {mergePreview ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMergePreview(null);
                      setMergeTargetId(null);
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Terug
                  </button>
                  <button
                    onClick={handleMergeConfirm}
                    disabled={merging}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {merging ? "Samenvoegen..." : "Definitief samenvoegen"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMerge(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
