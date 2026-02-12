"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  PhoneArrowDownLeftIcon,
  PhoneArrowUpRightIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  UserPlusIcon,
  ArrowTopRightOnSquareIcon,
  FolderIcon,
  XMarkIcon,
  PencilSquareIcon,
  ChatBubbleLeftEllipsisIcon,
  UserCircleIcon,
  CheckIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import ProjectSelector from "@/components/projects/ProjectSelector";

interface Project {
  id: string;
  name: string;
  status: string;
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
  mauticContactId: number | null;
  contactName: string | null;
  points: number;
  project: Project | null;
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

// AI profiel is een JSON object met dynamische sleutels (bijv. "Interesse", "Fase", etc.)
// Waarden kunnen primitief zijn of geneste structuren
type AiProfileData = Record<string, unknown>;

interface ContactEditData {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  mobile: string;
  company: string;
  address1: string;
  city: string;
  zipcode: string;
  country: string;
  website: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type FilterDirection = "" | "inbound" | "outbound";
type FilterReason = "" | "completed" | "no-answer" | "busy" | "cancelled";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

export default function TelefoniePage() {
  const searchParams = useSearchParams();
  const [calls, setCalls] = useState<Call[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDirection, setFilterDirection] = useState<FilterDirection>("");
  const [filterReason, setFilterReason] = useState<FilterReason>("");
  const [page, setPage] = useState(1);

  // Nieuw contact modal
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactData, setNewContactData] = useState({
    firstname: "",
    lastname: "",
    email: "",
    phone: "",
    mobile: "",
  });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMessage, setContactMessage] = useState("");

  // Project koppeling modal
  const [showLinkProject, setShowLinkProject] = useState(false);
  const [linkCallId, setLinkCallId] = useState("");
  const [linkProjectId, setLinkProjectId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

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

  // AI profiel bewerken
  const [editingAiProfile, setEditingAiProfile] = useState(false);
  const [aiProfileData, setAiProfileData] = useState<AiProfileData>({});
  const [aiProfileSaving, setAiProfileSaving] = useState(false);
  const [aiProfileMessage, setAiProfileMessage] = useState("");
  // Nieuw veld toevoegen aan AI profiel
  const [newProfileKey, setNewProfileKey] = useState("");
  const [newProfileValue, setNewProfileValue] = useState("");

  // Contact gegevens bewerken
  const [editingContact, setEditingContact] = useState(false);
  const [contactEditData, setContactEditData] = useState<ContactEditData>({
    firstname: "", lastname: "", email: "", phone: "", mobile: "",
    company: "", address1: "", city: "", zipcode: "", country: "", website: "",
  });
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEditMessage, setContactEditMessage] = useState("");

  // Check of er een 'nieuw' parameter is (van call notification)
  useEffect(() => {
    const nieuwNummer = searchParams.get("nieuw");
    if (nieuwNummer) {
      setNewContactPhone(nieuwNummer);
      setNewContactData((prev) => ({
        ...prev,
        phone: nieuwNummer,
        mobile:
          nieuwNummer.startsWith("06") || nieuwNummer.startsWith("+316")
            ? nieuwNummer
            : "",
      }));
      setShowNewContact(true);
    }
  }, [searchParams]);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "50");
    if (search) params.set("search", search);
    if (filterDirection) params.set("direction", filterDirection);
    if (filterReason) params.set("reason", filterReason);

    try {
      const response = await fetch(`/api/calls?${params}`);
      const data = await response.json();
      setCalls(data.calls || []);
      setPagination(data.pagination || null);
    } catch {
      console.error("Fout bij ophalen calls");
    }
    setLoading(false);
  }, [page, search, filterDirection, filterReason]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Auto-refresh elke 30 seconden
  useEffect(() => {
    const interval = setInterval(fetchCalls, 30000);
    return () => clearInterval(interval);
  }, [fetchCalls]);

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    setContactSaving(true);
    setContactMessage("");

    try {
      const response = await fetch("/api/mautic/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newContactData),
      });

      const result = await response.json();

      if (result.success) {
        setContactMessage("Contact aangemaakt in Mautic!");
        setTimeout(() => {
          setShowNewContact(false);
          setContactMessage("");
          setNewContactData({
            firstname: "",
            lastname: "",
            email: "",
            phone: "",
            mobile: "",
          });
        }, 2000);
      } else {
        setContactMessage(result.error || "Fout bij aanmaken contact");
      }
    } catch {
      setContactMessage("Netwerkfout");
    }

    setContactSaving(false);
  }

  async function handleLinkProject(e: React.FormEvent) {
    e.preventDefault();
    setLinkSaving(true);

    try {
      const response = await fetch(`/api/calls/${linkCallId}/project`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: linkProjectId || null }),
      });

      if (response.ok) {
        setShowLinkProject(false);
        setLinkCallId("");
        setLinkProjectId("");
        fetchCalls();
      }
    } catch {
      console.error("Fout bij koppelen project");
    }
    setLinkSaving(false);
  }

  function openLinkProject(call: Call) {
    setLinkCallId(call.id);
    setLinkProjectId(call.project?.id || "");
    setShowLinkProject(true);
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
    } catch {
      console.error("Fout bij ophalen notities");
    }
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
        // Update lokale _count
        setCalls((prev) =>
          prev.map((c) =>
            c.id === noteCallId
              ? { ...c, _count: { notes: (c._count?.notes || 0) + 1 } }
              : c
          )
        );
      }
    } catch {
      console.error("Fout bij opslaan notitie");
    }
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
      // Update lokale _count
      setCalls((prev) =>
        prev.map((c) =>
          c.id === noteCallId
            ? { ...c, _count: { notes: Math.max(0, (c._count?.notes || 0) - 1) } }
            : c
        )
      );
    } catch {
      console.error("Fout bij verwijderen notitie");
    }
  }

  // --- Contact detail ---
  async function openContactPanel(mauticContactId: number) {
    setShowContactPanel(true);
    setContactDetail(null);
    setContactDetailLoading(true);
    setEditingAiProfile(false);
    setAiProfileMessage("");
    setEditingContact(false);
    setContactEditMessage("");

    try {
      const res = await fetch(`/api/mautic/contact?id=${mauticContactId}&full=1`);
      const data = await res.json();
      if (data.contact) {
        setContactDetail(data.contact);
        // Initialiseer bewerkbare velden
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
        // Parse AI profiel — behoud originele structuur (arrays, objecten, etc.)
        try {
          let parsed = data.contact.aiProfile
            ? (typeof data.contact.aiProfile === "string"
                ? JSON.parse(data.contact.aiProfile)
                : data.contact.aiProfile)
            : {};
          // Als het veld geen object is of een array, reset
          if (typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};
          setAiProfileData(parsed as AiProfileData);
        } catch {
          setAiProfileData({});
        }
      }
    } catch {
      console.error("Fout bij ophalen contact");
    }
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
        body: JSON.stringify({
          id: contactDetail.id,
          fields: {
            firstname: contactEditData.firstname,
            lastname: contactEditData.lastname,
            email: contactEditData.email,
            phone: contactEditData.phone,
            mobile: contactEditData.mobile,
            company: contactEditData.company,
            address1: contactEditData.address1,
            city: contactEditData.city,
            zipcode: contactEditData.zipcode,
            country: contactEditData.country,
            website: contactEditData.website,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setContactEditMessage("Opgeslagen");
        setEditingContact(false);
        // Update lokale state
        setContactDetail((prev) =>
          prev ? {
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
          } : prev
        );
        setTimeout(() => setContactEditMessage(""), 3000);
      } else {
        setContactEditMessage("Fout bij opslaan");
      }
    } catch {
      setContactEditMessage("Netwerkfout");
    }
    setContactEditSaving(false);
  }

  async function handleSaveAiProfile() {
    if (!contactDetail) return;
    setAiProfileSaving(true);
    setAiProfileMessage("");

    try {
      const res = await fetch("/api/mautic/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contactDetail.id,
          fields: { ai_profiel_data: JSON.stringify(aiProfileData, null, 0) },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiProfileMessage("Profiel opgeslagen");
        setEditingAiProfile(false);
        setContactDetail((prev) =>
          prev ? { ...prev, aiProfile: JSON.stringify(aiProfileData) } : prev
        );
        setTimeout(() => setAiProfileMessage(""), 3000);
      } else {
        setAiProfileMessage("Fout bij opslaan");
      }
    } catch {
      setAiProfileMessage("Netwerkfout");
    }
    setAiProfileSaving(false);
  }

  function handleAddProfileField() {
    if (!newProfileKey.trim()) return;
    let parsedValue: unknown = newProfileValue.trim();
    // Probeer als JSON te parsen als het begint met [ of {
    if (parsedValue && typeof parsedValue === "string" && (parsedValue.startsWith("[") || parsedValue.startsWith("{"))) {
      try { parsedValue = JSON.parse(parsedValue); } catch { /* laat als string */ }
    }
    setAiProfileData((prev) => ({
      ...prev,
      [newProfileKey.trim()]: parsedValue,
    }));
    setNewProfileKey("");
    setNewProfileValue("");
  }

  function handleRemoveProfileField(key: string) {
    setAiProfileData((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Slimme weergave van een AI profiel waarde
  function renderAiValue(value: unknown): React.ReactNode {
    if (value === null || value === undefined || value === "") {
      return <span className="italic text-gray-400">leeg</span>;
    }
    // Array
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="italic text-gray-400">leeg</span>;
      // Check of het array van objecten is
      if (typeof value[0] === "object") {
        return (
          <div className="space-y-1.5">
            {(value as Record<string, unknown>[]).map((item, i) => (
              <div key={i} className="rounded bg-gray-50 px-2 py-1.5 text-xs">
                {Object.entries(item).map(([k, v]) => (
                  <div key={k} className="flex gap-1">
                    <span className="font-medium text-gray-500 shrink-0">{k}:</span>
                    <span className="text-gray-800 break-all">{String(v ?? "")}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
      // Array van strings/primitieven → chips
      return (
        <div className="flex flex-wrap gap-1">
          {(value as unknown[]).map((v, i) => (
            <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{String(v)}</span>
          ))}
        </div>
      );
    }
    // Object (niet array)
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return <span className="italic text-gray-400">leeg</span>;
      return (
        <div className="space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-1 text-xs">
              <span className="font-medium text-gray-500 shrink-0">{k}:</span>
              <span className="text-gray-800 break-all">
                {v === null || v === undefined || v === "" ? (
                  <span className="italic text-gray-400">leeg</span>
                ) : typeof v === "object" ? (
                  <span className="text-gray-500">{JSON.stringify(v)}</span>
                ) : typeof v === "number" ? (
                  <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${v > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{String(v)}</span>
                ) : (
                  String(v)
                )}
              </span>
            </div>
          ))}
        </div>
      );
    }
    // Boolean
    if (typeof value === "boolean") {
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${value ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {value ? "Ja" : "Nee"}
        </span>
      );
    }
    // Getal
    if (typeof value === "number") {
      return <span className="font-mono text-gray-900">{value}</span>;
    }
    // String
    return <span className="text-gray-900 break-words">{String(value)}</span>;
  }

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
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
    if (reason === "cancelled") {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          Geannuleerd
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
        {reason || "Onbekend"}
      </span>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Telefonie</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overzicht van alle gesprekken
          </p>
        </div>
        <button
          onClick={() => setShowNewContact(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <UserPlusIcon className="h-4 w-4" />
          Nieuw contact
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Zoek op nummer of naam..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <FunnelIcon className="h-4 w-4 text-gray-400" />
          <select
            value={filterDirection}
            onChange={(e) => {
              setFilterDirection(e.target.value as FilterDirection);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Alle richtingen</option>
            <option value="inbound">Inkomend</option>
            <option value="outbound">Uitgaand</option>
          </select>

          <select
            value={filterReason}
            onChange={(e) => {
              setFilterReason(e.target.value as FilterReason);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Alle statussen</option>
            <option value="completed">Beantwoord</option>
            <option value="no-answer">Gemist</option>
            <option value="busy">In gesprek</option>
          </select>
        </div>
      </div>

      {/* Tabel */}
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
                Project
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
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Laden...
                </td>
              </tr>
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Geen gesprekken gevonden
                </td>
              </tr>
            ) : (
              calls.map((call) => (
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
                    {call.callerName && (
                      <span className="ml-2 text-gray-500">
                        ({call.callerName})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {call.contactName ? (
                      <button
                        onClick={() =>
                          call.mauticContactId &&
                          openContactPanel(call.mauticContactId)
                        }
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        <UserCircleIcon className="h-4 w-4" />
                        {call.contactName}
                      </button>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {call.project ? (
                      <a
                        href={`/projecten/${call.project.id}`}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                      >
                        <FolderIcon className="h-3 w-3" />
                        {call.project.name}
                      </a>
                    ) : (
                      <button
                        onClick={() => openLinkProject(call)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                      >
                        <FolderIcon className="h-3 w-3" />
                        Koppelen
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getReasonBadge(call.reason)}
                  </td>
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
                        Notitie{call._count?.notes > 0 && <span className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white">{call._count.notes}</span>}
                      </button>

                      {call.mauticContactId ? (
                        <>
                          <button
                            onClick={() =>
                              openContactPanel(call.mauticContactId!)
                            }
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
                      ) : (
                        <button
                          onClick={() => {
                            const number =
                              call.direction === "inbound"
                                ? call.callerNumber
                                : call.destinationNumber;
                            setNewContactPhone(number);
                            setNewContactData((prev) => ({
                              ...prev,
                              phone: number,
                            }));
                            setShowNewContact(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
                        >
                          <UserPlusIcon className="h-3 w-3" />
                          Aanmaken
                        </button>
                      )}
                      {call.project && (
                        <button
                          onClick={() => openLinkProject(call)}
                          className="rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          title="Project wijzigen"
                        >
                          Wijzig
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginatie */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {pagination.total} gesprekken totaal
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
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Volgende
            </button>
          </div>
        </div>
      )}

      {/* ===== NOTITIE MODAL ===== */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <ChatBubbleLeftEllipsisIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Notities — {noteCallName}
                </h2>
              </div>
              <button
                onClick={() => setShowNoteModal(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Notitie invoer */}
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

            {/* Notities lijst */}
            <div className="max-h-72 overflow-y-auto border-t border-gray-100 px-6 py-4">
              {notesLoading ? (
                <p className="text-center text-sm text-gray-400">Laden...</p>
              ) : notes.length === 0 ? (
                <p className="text-center text-sm text-gray-400">
                  Nog geen notities voor dit gesprek
                </p>
              ) : (
                <ul className="space-y-3">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-lg bg-gray-50 px-4 py-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 whitespace-pre-wrap text-gray-800">
                          {n.note}
                        </p>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          className="mt-0.5 shrink-0 text-gray-300 transition-colors hover:text-red-500"
                          title="Verwijderen"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {n.createdBy} ·{" "}
                        {new Date(n.createdAt).toLocaleString("nl-NL", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-100 px-6 py-3">
              <button
                onClick={() => setShowNoteModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONTACT DETAIL PANEL (SIDE PANEL) ===== */}
      {showContactPanel && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="flex-1 bg-black/40"
            onClick={() => setShowContactPanel(false)}
          />
          {/* Panel */}
          <div className="w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-2">
                <UserCircleIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Contact details
                </h2>
              </div>
              <button
                onClick={() => setShowContactPanel(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
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
              <div className="px-6 py-4 space-y-6">
                {/* Naam & punten */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {[contactDetail.firstname, contactDetail.lastname]
                        .filter(Boolean)
                        .join(" ") || "Onbekend"}
                    </h3>
                    {contactDetail.company && (
                      <p className="text-sm text-gray-500">
                        {contactDetail.company}
                      </p>
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
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Contactgegevens */}
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Contactgegevens
                    </p>
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
                          <span className={`text-xs ${contactEditMessage.includes("Fout") || contactEditMessage.includes("fout") ? "text-red-500" : "text-green-600"}`}>
                            {contactEditMessage}
                          </span>
                        )}
                        <button
                          onClick={() => { setEditingContact(false); setContactEditMessage(""); }}
                          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                        >
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

                  {([
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
                  ] as { label: string; field: keyof ContactEditData; type: string }[]).map(({ label, field, type }) => {
                    const displayValue = contactDetail[field === "company" ? "company" : field === "address1" ? "address1" : field] as string | null;
                    if (!editingContact && !displayValue) return null;
                    return (
                      <div key={field} className="grid grid-cols-3 items-center px-4 py-2 text-sm">
                        <span className="text-gray-500 text-xs">{label}</span>
                        {editingContact ? (
                          <input
                            type={type}
                            value={contactEditData[field]}
                            onChange={(e) => setContactEditData((prev) => ({ ...prev, [field]: e.target.value }))}
                            className="col-span-2 rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                            placeholder={label}
                          />
                        ) : (
                          <span className="col-span-2 text-gray-900 break-all">
                            {field === "email" ? (
                              <a href={`mailto:${displayValue}`} className="text-primary hover:underline">{displayValue}</a>
                            ) : field === "website" ? (
                              <a href={displayValue!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{displayValue}</a>
                            ) : (
                              displayValue
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-3 px-4 py-2 text-sm">
                    <span className="text-gray-500 text-xs">Toegevoegd</span>
                    <span className="col-span-2 text-gray-900">{formatDate(contactDetail.dateAdded)}</span>
                  </div>
                  {contactDetail.lastActive && (
                    <div className="grid grid-cols-3 px-4 py-2 text-sm">
                      <span className="text-gray-500 text-xs">Laatste actie</span>
                      <span className="col-span-2 text-gray-900">{formatDate(contactDetail.lastActive)}</span>
                    </div>
                  )}
                </div>

                {/* AI Data Profiel */}
                <div className="rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      AI Data Profiel
                    </p>
                    {!editingAiProfile ? (
                      <button
                        onClick={() => setEditingAiProfile(true)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
                      >
                        <PencilIcon className="h-3 w-3" />
                        Bewerken
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {aiProfileMessage && (
                          <span
                            className={`text-xs ${
                              aiProfileMessage.includes("Fout") ||
                              aiProfileMessage.includes("fout")
                                ? "text-red-500"
                                : "text-green-600"
                            }`}
                          >
                            {aiProfileMessage}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingAiProfile(false);
                            // Reset naar opgeslagen waarde (kan al geparsed object zijn)
                            try {
                              const raw = contactDetail.aiProfile;
                              const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
                              setAiProfileData(typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
                            } catch {
                              setAiProfileData({});
                            }
                          }}
                          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                        >
                          Annuleren
                        </button>
                        <button
                          onClick={handleSaveAiProfile}
                          disabled={aiProfileSaving}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                        >
                          <CheckIcon className="h-3 w-3" />
                          {aiProfileSaving ? "..." : "Opslaan"}
                        </button>
                      </div>
                    )}
                  </div>

                  {Object.keys(aiProfileData).length === 0 && !editingAiProfile ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-gray-400">Geen AI profiel data beschikbaar</p>
                      <button
                        onClick={() => setEditingAiProfile(true)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <PencilSquareIcon className="h-3 w-3" />
                        Profiel invullen
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {Object.entries(aiProfileData).map(([key, value]) => {
                        const isComplex = typeof value === "object" && value !== null;
                        const editValue = isComplex
                          ? JSON.stringify(value, null, 2)
                          : String(value ?? "");
                        return (
                          <div key={key} className="px-4 py-2.5 text-sm">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-semibold text-xs text-gray-500 uppercase tracking-wide">{key}</span>
                              {editingAiProfile && (
                                <button
                                  onClick={() => handleRemoveProfileField(key)}
                                  className="shrink-0 text-gray-300 hover:text-red-500 mt-0.5"
                                  title="Verwijderen"
                                >
                                  <TrashIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {editingAiProfile ? (
                              <textarea
                                rows={isComplex ? Math.min(8, (editValue.split("\n").length + 1)) : 1}
                                value={editValue}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  // Probeer JSON te parsen, anders als string opslaan
                                  try {
                                    setAiProfileData((prev) => ({ ...prev, [key]: JSON.parse(raw) }));
                                  } catch {
                                    setAiProfileData((prev) => ({ ...prev, [key]: raw }));
                                  }
                                }}
                                className="w-full resize-y rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                              />
                            ) : (
                              <div className="text-sm">
                                {renderAiValue(value)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Nieuw veld toevoegen */}
                      {editingAiProfile && (
                        <div className="px-4 py-3 bg-gray-50">
                          <p className="mb-2 text-xs font-medium text-gray-500">Veld toevoegen</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newProfileKey}
                              onChange={(e) => setNewProfileKey(e.target.value)}
                              placeholder="Naam (bv. interesse)"
                              className="w-1/3 rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                            />
                            <input
                              type="text"
                              value={newProfileValue}
                              onChange={(e) => setNewProfileValue(e.target.value)}
                              placeholder="Waarde of JSON"
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddProfileField(); } }}
                            />
                            <button
                              type="button"
                              onClick={handleAddProfileField}
                              disabled={!newProfileKey.trim()}
                              className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                            >
                              + Toevoegen
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mautic link */}
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

      {/* ===== NIEUW CONTACT MODAL ===== */}
      {showNewContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Nieuw contact aanmaken
              </h2>
              <button
                onClick={() => {
                  setShowNewContact(false);
                  setContactMessage("");
                }}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {newContactPhone && (
              <p className="mb-4 text-sm text-gray-500">
                Telefoonnummer: <strong>{newContactPhone}</strong>
              </p>
            )}

            {contactMessage && (
              <div
                className={`mb-4 rounded-lg px-4 py-2 text-sm ${
                  contactMessage.includes("aangemaakt")
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {contactMessage}
              </div>
            )}

            <form onSubmit={handleCreateContact}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Voornaam
                  </label>
                  <input
                    type="text"
                    value={newContactData.firstname}
                    onChange={(e) =>
                      setNewContactData((d) => ({
                        ...d,
                        firstname: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Achternaam *
                  </label>
                  <input
                    type="text"
                    required
                    value={newContactData.lastname}
                    onChange={(e) =>
                      setNewContactData((d) => ({
                        ...d,
                        lastname: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  E-mail
                </label>
                <input
                  type="email"
                  value={newContactData.email}
                  onChange={(e) =>
                    setNewContactData((d) => ({
                      ...d,
                      email: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Telefoon
                  </label>
                  <input
                    type="tel"
                    value={newContactData.phone}
                    onChange={(e) =>
                      setNewContactData((d) => ({
                        ...d,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Mobiel
                  </label>
                  <input
                    type="tel"
                    value={newContactData.mobile}
                    onChange={(e) =>
                      setNewContactData((d) => ({
                        ...d,
                        mobile: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewContact(false);
                    setContactMessage("");
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={contactSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {contactSaving ? "Opslaan..." : "Opslaan in Mautic"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== PROJECT KOPPELEN MODAL ===== */}
      {showLinkProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Gesprek koppelen aan project
              </h2>
              <button
                onClick={() => setShowLinkProject(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLinkProject}>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Project
                </label>
                <ProjectSelector
                  value={linkProjectId}
                  onChange={setLinkProjectId}
                  emptyLabel="Geen project (ontkoppelen)"
                  className="w-full"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLinkProject(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={linkSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {linkSaving ? "Opslaan..." : "Koppelen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
