"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  PhoneArrowDownLeftIcon,
  PhoneArrowUpRightIcon,
  PhoneXMarkIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  UserPlusIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

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
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type FilterDirection = "" | "inbound" | "outbound";
type FilterReason = "" | "completed" | "no-answer" | "busy" | "cancelled";

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

  // Check of er een 'nieuw' parameter is (van call notification)
  useEffect(() => {
    const nieuwNummer = searchParams.get("nieuw");
    if (nieuwNummer) {
      setNewContactPhone(nieuwNummer);
      setNewContactData((prev) => ({
        ...prev,
        phone: nieuwNummer,
        mobile: nieuwNummer.startsWith("06") || nieuwNummer.startsWith("+316")
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

  function formatTime(timestamp: string) {
    const date = new Date(timestamp);
    return date.toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getReasonBadge(reason: string | null, direction: string) {
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
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Laden...
                </td>
              </tr>
            ) : calls.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
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
                      <span className="font-medium text-gray-900">
                        {call.contactName}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getReasonBadge(call.reason, call.direction)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {call.mauticContactId ? (
                        <a
                          href={`${process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl"}/s/contacts/view/${call.mauticContactId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          Mautic
                          <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                        </a>
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

      {/* Nieuw Contact Modal */}
      {showNewContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Nieuw contact aanmaken
            </h2>
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
    </div>
  );
}
