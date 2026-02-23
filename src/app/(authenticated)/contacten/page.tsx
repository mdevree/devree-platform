"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  CheckIcon,
  PencilIcon,
  TrashIcon,
  PencilSquareIcon,
  XMarkIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

interface Contact {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  points: number;
  lastActive: string | null;
}

interface ContactFull extends Contact {
  address1: string | null;
  city: string | null;
  zipcode: string | null;
  country: string | null;
  website: string | null;
  aiProfile: string | null;
  tags: string[];
  dateAdded: string | null;
}

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

type AiProfileData = Record<string, unknown>;

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

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

export default function ContactenPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Contact detail panel
  const [showPanel, setShowPanel] = useState(false);
  const [panelContact, setPanelContact] = useState<ContactFull | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  // Contact bewerken
  const [editingContact, setEditingContact] = useState(false);
  const [contactEditData, setContactEditData] = useState<ContactEditData>({
    firstname: "", lastname: "", email: "", phone: "", mobile: "",
    company: "", address1: "", city: "", zipcode: "", country: "", website: "",
  });
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEditMessage, setContactEditMessage] = useState("");

  // Nieuw contact aanmaken
  const [showNewContact, setShowNewContact] = useState(false);
  const [newContactData, setNewContactData] = useState({
    firstname: "", lastname: "", email: "", phone: "", mobile: "", company: "",
  });
  const [newContactSaving, setNewContactSaving] = useState(false);
  const [newContactError, setNewContactError] = useState("");

  // AI profiel bewerken
  const [editingAiProfile, setEditingAiProfile] = useState(false);
  const [aiProfileData, setAiProfileData] = useState<AiProfileData>({});
  const [aiProfileRaw, setAiProfileRaw] = useState<Record<string, string>>({});
  const [aiProfileSaving, setAiProfileSaving] = useState(false);
  const [aiProfileMessage, setAiProfileMessage] = useState("");
  const [newProfileKey, setNewProfileKey] = useState("");
  const [newProfileValue, setNewProfileValue] = useState("");

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "30");
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/mautic/contacts?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setPagination(data.pagination || null);
    } catch {
      console.error("Fout bij ophalen contacten");
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounced zoeken
  function handleSearchChange(val: string) {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 400);
  }

  async function openPanel(contactId: number) {
    setShowPanel(true);
    setPanelContact(null);
    setPanelLoading(true);
    setEditingContact(false);
    setEditingAiProfile(false);
    setContactEditMessage("");
    setAiProfileMessage("");

    try {
      const res = await fetch(`/api/mautic/contact?id=${contactId}&full=1`);
      const data = await res.json();
      if (data.contact) {
        setPanelContact(data.contact);
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
        // Parse AI profiel
        try {
          const raw = data.contact.aiProfile;
          const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
          setAiProfileData(typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
        } catch {
          setAiProfileData({});
        }
        setAiProfileRaw({});
      }
    } catch {
      console.error("Fout bij ophalen contact detail");
    }
    setPanelLoading(false);
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    setNewContactSaving(true);
    setNewContactError("");
    try {
      const res = await fetch("/api/mautic/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newContactData),
      });
      const data = await res.json();
      if (data.id || data.contact) {
        setShowNewContact(false);
        setNewContactData({ firstname: "", lastname: "", email: "", phone: "", mobile: "", company: "" });
        fetchContacts();
      } else {
        setNewContactError(data.error || "Fout bij aanmaken contact");
      }
    } catch {
      setNewContactError("Netwerkfout");
    }
    setNewContactSaving(false);
  }

  async function handleSaveContactFields() {
    if (!panelContact) return;
    setContactEditSaving(true);
    setContactEditMessage("");

    try {
      const res = await fetch("/api/mautic/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: panelContact.id,
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
        setPanelContact((prev) =>
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
        // Update ook de lijst
        setContacts((prev) =>
          prev.map((c) =>
            c.id === panelContact.id
              ? {
                  ...c,
                  firstname: contactEditData.firstname,
                  lastname: contactEditData.lastname,
                  email: contactEditData.email || null,
                  phone: contactEditData.phone || null,
                  mobile: contactEditData.mobile || null,
                  company: contactEditData.company || null,
                }
              : c
          )
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
    if (!panelContact) return;
    setAiProfileSaving(true);
    setAiProfileMessage("");

    const finalData: AiProfileData = { ...aiProfileData };
    for (const [key, rawText] of Object.entries(aiProfileRaw)) {
      try {
        finalData[key] = JSON.parse(rawText);
      } catch {
        finalData[key] = rawText;
      }
    }

    try {
      const res = await fetch("/api/mautic/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: panelContact.id,
          fields: { ai_profiel_data: JSON.stringify(finalData, null, 0) },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiProfileMessage("Profiel opgeslagen");
        setEditingAiProfile(false);
        setAiProfileData(finalData);
        setAiProfileRaw({});
        setPanelContact((prev) =>
          prev ? { ...prev, aiProfile: JSON.stringify(finalData) } : prev
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
    if (typeof parsedValue === "string" && (parsedValue.startsWith("[") || parsedValue.startsWith("{"))) {
      try { parsedValue = JSON.parse(parsedValue); } catch { /* laat als string */ }
    }
    setAiProfileData((prev) => ({ ...prev, [newProfileKey.trim()]: parsedValue }));
    setNewProfileKey("");
    setNewProfileValue("");
  }

  function handleRemoveProfileField(key: string) {
    setAiProfileData((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setAiProfileRaw((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function renderAiValue(value: unknown): React.ReactNode {
    if (value === null || value === undefined || value === "") {
      return <span className="italic text-gray-400">leeg</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="italic text-gray-400">leeg</span>;
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
      return (
        <div className="flex flex-wrap gap-1">
          {(value as unknown[]).map((v, i) => (
            <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{String(v)}</span>
          ))}
        </div>
      );
    }
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
                ) : String(v)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    if (typeof value === "boolean") {
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${value ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {value ? "Ja" : "Nee"}
        </span>
      );
    }
    if (typeof value === "number") return <span className="font-mono text-gray-900">{value}</span>;
    return <span className="text-gray-900 break-words">{String(value)}</span>;
  }

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatLastActive(d: string | null) {
    if (!d) return null;
    const date = new Date(d);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "vandaag";
    if (diffDays === 1) return "gisteren";
    if (diffDays < 7) return `${diffDays} dagen geleden`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weken geleden`;
    return formatDate(d);
  }

  const contactFields = [
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
  ] as { label: string; field: keyof ContactEditData; type: string }[];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacten</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Mautic CRM — meest recent actieve contacten
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pagination && (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
                {pagination.total.toLocaleString("nl-NL")} contacten
              </span>
            )}
            <button
              onClick={() => { setShowNewContact(true); setNewContactError(""); }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              <PlusIcon className="h-4 w-4" />
              Nieuw contact
            </button>
          </div>
        </div>

        {/* Zoekbalk */}
        <div className="mt-4 relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Zoek op naam, e-mail of telefoon…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200 bg-white">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Naam</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Bedrijf</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Punten</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Laatste activiteit</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  Laden…
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  {search ? `Geen contacten gevonden voor "${search}"` : "Geen contacten gevonden"}
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openPanel(contact.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(contact.firstname?.[0] || contact.lastname?.[0] || "?").toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 hover:text-primary">
                          {[contact.firstname, contact.lastname].filter(Boolean).join(" ") || <span className="italic text-gray-400">Onbekend</span>}
                        </p>
                        <p className="text-xs text-gray-400">#{contact.id}</p>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {contact.company ? (
                      <span className="inline-flex items-center gap-1">
                        <BuildingOfficeIcon className="h-3.5 w-3.5 text-gray-400" />
                        {contact.company}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-gray-600 hover:text-primary">
                          <EnvelopeIcon className="h-3.5 w-3.5 text-gray-400" />
                          {contact.email}
                        </a>
                      )}
                      {(contact.phone || contact.mobile) && (
                        <span className="inline-flex items-center gap-1 text-gray-600">
                          <PhoneIcon className="h-3.5 w-3.5 text-gray-400" />
                          {contact.phone || contact.mobile}
                        </span>
                      )}
                      {!contact.email && !contact.phone && !contact.mobile && (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.points > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {contact.points} pts
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatLastActive(contact.lastActive) || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openPanel(contact.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <UserCircleIcon className="h-3.5 w-3.5" />
                        Details
                      </button>
                      <a
                        href={`${MAUTIC_URL}/s/contacts/view/${contact.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-100"
                        title="Openen in Mautic"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                      </a>
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
        <div className="border-t border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {((page - 1) * pagination.limit) + 1}–{Math.min(page * pagination.limit, pagination.total)} van {pagination.total.toLocaleString("nl-NL")}
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

      {/* ===== CONTACT DETAIL PANEL ===== */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowPanel(false)} />
          <div className="w-full max-w-md overflow-y-auto bg-white shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div className="flex items-center gap-2">
                <UserCircleIcon className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">Contact details</h2>
              </div>
              <button onClick={() => setShowPanel(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {panelLoading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-gray-400">Laden…</p>
              </div>
            ) : !panelContact ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-gray-400">Contact niet gevonden</p>
              </div>
            ) : (
              <div className="px-6 py-4 space-y-6">
                {/* Naam & punten */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {[panelContact.firstname, panelContact.lastname].filter(Boolean).join(" ") || "Onbekend"}
                    </h3>
                    {panelContact.company && (
                      <p className="text-sm text-gray-500">{panelContact.company}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {panelContact.points > 0 && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                        {panelContact.points} pts
                      </span>
                    )}
                    <a
                      href={`${MAUTIC_URL}/s/contacts/view/${panelContact.id}`}
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
                {panelContact.tags && panelContact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {panelContact.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        {tag}
                      </span>
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
                          {contactEditSaving ? "…" : "Opslaan"}
                        </button>
                      </div>
                    )}
                  </div>

                  {contactFields.map(({ label, field, type }) => {
                    const displayValue = panelContact[field as keyof ContactFull] as string | null;
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
                            ) : displayValue}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-3 px-4 py-2 text-sm">
                    <span className="text-gray-500 text-xs">Toegevoegd</span>
                    <span className="col-span-2 text-gray-900">{formatDate(panelContact.dateAdded)}</span>
                  </div>
                  {panelContact.lastActive && (
                    <div className="grid grid-cols-3 px-4 py-2 text-sm">
                      <span className="text-gray-500 text-xs">Laatste actie</span>
                      <span className="col-span-2 text-gray-900">{formatDate(panelContact.lastActive)}</span>
                    </div>
                  )}
                </div>

                {/* AI Data Profiel */}
                <div className="rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">AI Data Profiel</p>
                    {!editingAiProfile ? (
                      <button
                        onClick={() => {
                          const raw: Record<string, string> = {};
                          for (const [k, v] of Object.entries(aiProfileData)) {
                            raw[k] = typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "");
                          }
                          setAiProfileRaw(raw);
                          setEditingAiProfile(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
                      >
                        <PencilIcon className="h-3 w-3" />
                        Bewerken
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {aiProfileMessage && (
                          <span className={`text-xs ${aiProfileMessage.includes("Fout") ? "text-red-500" : "text-green-600"}`}>
                            {aiProfileMessage}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingAiProfile(false);
                            setAiProfileRaw({});
                            try {
                              const raw = panelContact.aiProfile;
                              const parsed = typeof raw === "string" ? JSON.parse(raw) : (raw || {});
                              setAiProfileData(typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
                            } catch { setAiProfileData({}); }
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
                          {aiProfileSaving ? "…" : "Opslaan"}
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
                        const rawText = aiProfileRaw[key] ?? (
                          typeof value === "object" && value !== null
                            ? JSON.stringify(value, null, 2)
                            : String(value ?? "")
                        );
                        const isComplex = typeof value === "object" && value !== null;
                        return (
                          <div key={key} className="px-4 py-2.5 text-sm">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-semibold text-xs text-gray-500 uppercase tracking-wide">{key}</span>
                              {editingAiProfile && (
                                <button onClick={() => handleRemoveProfileField(key)} className="shrink-0 text-gray-300 hover:text-red-500 mt-0.5">
                                  <TrashIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {editingAiProfile ? (
                              <textarea
                                rows={isComplex ? Math.min(8, rawText.split("\n").length + 1) : 1}
                                value={rawText}
                                onChange={(e) => {
                                  const txt = e.target.value;
                                  setAiProfileRaw((prev) => ({ ...prev, [key]: txt }));
                                  try { setAiProfileData((prev) => ({ ...prev, [key]: JSON.parse(txt) })); } catch { /* wacht op valide JSON */ }
                                }}
                                className="w-full resize-y rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                              />
                            ) : (
                              <div className="text-sm">{renderAiValue(value)}</div>
                            )}
                          </div>
                        );
                      })}

                      {editingAiProfile && (
                        <div className="px-4 py-3 bg-gray-50">
                          <p className="mb-2 text-xs font-medium text-gray-500">Veld toevoegen</p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newProfileKey}
                              onChange={(e) => setNewProfileKey(e.target.value)}
                              placeholder="Naam"
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

                {/* Email activiteit */}
                <EmailActivitySection contactId={panelContact.id} />

                {/* Mautic link */}
                <a
                  href={`${MAUTIC_URL}/s/contacts/view/${panelContact.id}`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Nieuw contact aanmaken</h2>
              <button
                onClick={() => setShowNewContact(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateContact} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Voornaam *</label>
                  <input
                    type="text"
                    required
                    value={newContactData.firstname}
                    onChange={(e) => setNewContactData((d) => ({ ...d, firstname: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Jan"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Achternaam *</label>
                  <input
                    type="text"
                    required
                    value={newContactData.lastname}
                    onChange={(e) => setNewContactData((d) => ({ ...d, lastname: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="de Vries"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
                <input
                  type="email"
                  value={newContactData.email}
                  onChange={(e) => setNewContactData((d) => ({ ...d, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="jan@example.nl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Telefoon</label>
                  <input
                    type="tel"
                    value={newContactData.phone}
                    onChange={(e) => setNewContactData((d) => ({ ...d, phone: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="010-1234567"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Mobiel</label>
                  <input
                    type="tel"
                    value={newContactData.mobile}
                    onChange={(e) => setNewContactData((d) => ({ ...d, mobile: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="06-12345678"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bedrijf</label>
                <input
                  type="text"
                  value={newContactData.company}
                  onChange={(e) => setNewContactData((d) => ({ ...d, company: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="Optioneel"
                />
              </div>
              {newContactError && (
                <p className="text-sm text-red-600">{newContactError}</p>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewContact(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={newContactSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {newContactSaving ? "Aanmaken..." : "Contact aanmaken"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
