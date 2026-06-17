"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";
const REALWORKS_RELATIONS_URL = "https://crm.realworks.nl/servlets/objects/rela.person";

interface EnrichmentContact {
  id: number;
  firstname: string;
  lastname: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  points: number;
  lastActive: string | null;
  dateAdded: string | null;
  address1: string | null;
  city: string | null;
  zipcode: string | null;
  tags: string[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function fullName(contact: EnrichmentContact) {
  return [contact.firstname, contact.lastname].filter(Boolean).join(" ").trim() || "Naam onbekend";
}

function primaryPhone(contact: EnrichmentContact) {
  return contact.mobile || contact.phone || "";
}

function realworksSearchTerm(contact: EnrichmentContact) {
  return contact.email || primaryPhone(contact) || fullName(contact);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      onClick={copy}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-600 hover:border-primary/40 hover:text-primary"
      title={`${label} kopieren`}
    >
      <ClipboardDocumentIcon className="h-4 w-4" />
      {copied ? "Gekopieerd" : label}
    </button>
  );
}

export default function VerrijkenPage() {
  const [contacts, setContacts] = useState<EnrichmentContact[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "25",
    });
    if (search.trim()) params.set("search", search.trim());

    try {
      const res = await fetch(`/api/mautic/contacts/verrijken?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setPagination(data.pagination || null);
    } catch {
      setContacts([]);
      setPagination(null);
    }
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    // Externe Mautic-data ophalen; loading-state hoort bij deze synchronisatie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
  }, [fetchContacts]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 350);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Contacten verrijken</h1>
          <p className="mt-1 text-sm text-gray-500">
            Werkvoorraad uit Mautic voor contacten zonder Realworks-koppeling.
          </p>
        </div>
        <button
          onClick={fetchContacts}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowPathIcon className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          Vernieuwen
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Zoek op naam, e-mail of telefoon"
            className="h-10 w-full rounded-md border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        {pagination && (
          <p className="text-sm text-gray-500">
            {pagination.total} contacten · pagina {pagination.page} van {pagination.pages}
          </p>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">Contacten laden...</div>
      ) : contacts.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          Geen contacten om te verrijken gevonden.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Gegevens</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Aangemaakt</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((contact) => {
                const name = fullName(contact);
                const phone = primaryPhone(contact);
                const searchTerm = realworksSearchTerm(contact);

                return (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <UserCircleIcon className="mt-0.5 h-9 w-9 flex-shrink-0 text-gray-300" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{name}</p>
                          {contact.company && (
                            <p className="truncate text-xs text-gray-500">{contact.company}</p>
                          )}
                          {(contact.address1 || contact.city) && (
                            <p className="mt-1 truncate text-xs text-gray-400">
                              {[contact.address1, contact.zipcode, contact.city].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1 text-sm">
                        {contact.email && (
                          <p className="flex items-center gap-2 text-gray-700">
                            <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                            {contact.email}
                          </p>
                        )}
                        {phone && (
                          <p className="flex items-center gap-2 text-gray-700">
                            <PhoneIcon className="h-4 w-4 text-gray-400" />
                            {phone}
                          </p>
                        )}
                        {!contact.email && !phone && (
                          <p className="text-sm text-gray-400">Geen e-mail of telefoon</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatDate(contact.dateAdded)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <CopyButton value={contact.email || ""} label="E-mail" />
                        <CopyButton value={phone} label="Telefoon" />
                        <CopyButton value={name !== "Naam onbekend" ? name : ""} label="Naam" />
                        <a
                          href={`${MAUTIC_URL}/s/contacts/view/${contact.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2 text-xs font-medium text-gray-600 hover:border-primary/40 hover:text-primary"
                        >
                          Mautic
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </a>
                        <a
                          href={REALWORKS_RELATIONS_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-white hover:bg-primary/90"
                          title={`Zoek in Realworks op: ${searchTerm}`}
                        >
                          Realworks
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Vorige
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Volgende
          </button>
        </div>
      )}
    </div>
  );
}
