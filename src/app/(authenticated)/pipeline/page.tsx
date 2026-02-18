"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  FireIcon,
  UserCircleIcon,
  ChartBarIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

const MAUTIC_URL =
  process.env.NEXT_PUBLIC_MAUTIC_URL || "https://connect.devreemakelaardij.nl";

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
}

const STAGES = [
  { key: null, label: "Geen status", color: "bg-gray-50 border-gray-200" },
  { key: "gepland", label: "Gesprek gepland", color: "bg-blue-50 border-blue-200" },
  { key: "gehad", label: "Gesprek gehad", color: "bg-amber-50 border-amber-200" },
  { key: "followup_verstuurd", label: "Follow-up verstuurd", color: "bg-purple-50 border-purple-200" },
  { key: "offerte_geaccepteerd", label: "Offerte geaccepteerd", color: "bg-green-50 border-green-200" },
];

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

export default function PipelinePage() {
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [timingFilter, setTimingFilter] = useState("");
  const [selectedContact, setSelectedContact] = useState<PipelineContact | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (search.trim()) params.set("search", search.trim());
      if (segmentFilter) params.set("segment", segmentFilter);
      const res = await fetch(`/api/mautic/contacts/pipeline?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch { console.error("Fout bij ophalen pipeline"); }
    setLoading(false);
  }, [search, segmentFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Filter lokaal op timing (want Mautic where-filters op custom fields werken niet altijd)
  const filteredContacts = timingFilter
    ? contacts.filter((c) => c.timingGesprek === timingFilter)
    : contacts;

  // Groepeer per stage
  const contactsByStage = STAGES.reduce((acc, stage) => {
    acc[String(stage.key)] = filteredContacts.filter((c) => {
      const status = c.verkoopgesprekStatus || null;
      return status === stage.key;
    });
    return acc;
  }, {} as Record<string, PipelineContact[]>);

  const totalWarm = filteredContacts.filter(isWarm).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verkoopproces overzicht — {filteredContacts.length} contacten
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
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Pipeline laden...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {STAGES.map((stage) => {
            const stageContacts = contactsByStage[String(stage.key)] || [];
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
                  ×
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
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

              {/* Verkoopproces */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Verkoopproces</p>
                <dl className="space-y-1.5 text-sm">
                  {selectedContact.verkoopgesprekStatus && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Status gesprek</dt>
                      <dd className="font-medium text-gray-900">{selectedContact.verkoopgesprekStatus}</dd>
                    </div>
                  )}
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
                  {selectedContact.verkooopTiming && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Verkoop timing</dt>
                      <dd className="font-medium text-gray-900">{selectedContact.verkooopTiming}</dd>
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
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${interesse.value}%` }}
                          />
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
    </div>
  );
}
