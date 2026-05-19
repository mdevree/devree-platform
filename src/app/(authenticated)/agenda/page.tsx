"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  InformationCircleIcon,
  PhoneIcon,
  MapPinIcon,
  UserIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";

interface ProjectInfo {
  id: string;
  name: string;
  woningAdres: string | null;
  woningPlaats: string | null;
}

interface Afspraak {
  id: string;
  systemid: number;
  agbegin: string | null;
  agend: string | null;
  agdescr: string | null;
  agtype: string | null;
  agstatus: string | null;
  aglocation: string | null;
  agrcode: string | null;
  agobjcode: string | null;
  agowner: string | null;
  medewerkerFullname: string | null;
  agmemo: string | null;
  contactNaam: string | null;
  contactEmail: string | null;
  contactTelefoon: string | null;
  mauticContactId: number | null;
  projectId: string | null;
  enrichedAt: string | null;
  enrichmentStatus: string | null;
  project: ProjectInfo | null;
}

type ViewMode = "week" | "lijst";

const WEEKDAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

function formatTijd(dateStr: string | null): string {
  if (!dateStr) return "--:--";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatDatum(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`;
}

function getMaandag(date: Date): Date {
  const d = new Date(date);
  const dag = d.getDay();
  const diff = dag === 0 ? -6 : 1 - dag;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeWhatsApp(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  if (digits.startsWith("31")) return digits;
  if (digits.startsWith("0")) return "31" + digits.slice(1);
  return digits;
}

function typeBadgeKleur(agtype: string | null): string {
  if (!agtype) return "bg-gray-100 text-gray-600";
  const t = agtype.toLowerCase();
  if (t === "bezichtiging") return "bg-blue-100 text-blue-700";
  if (t.includes("gesprek")) return "bg-green-100 text-green-700";
  if (t.includes("opname")) return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-600";
}

export default function AgendaPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [weekStart, setWeekStart] = useState<Date>(() => getMaandag(new Date()));
  const [afspraken, setAfspraken] = useState<Afspraak[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState("alle");
  const [medewerkerFilter, setMedewerkerFilter] = useState("alle");
  const [agTypes, setAgTypes] = useState<string[]>([]);
  const [medewerkers, setMedewerkers] = useState<string[]>([]);

  const weekEind = new Date(weekStart);
  weekEind.setDate(weekStart.getDate() + 6);
  weekEind.setHours(23, 59, 59, 999);

  const laadAfspraken = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (view === "week") {
        const eind = new Date(weekStart);
        eind.setDate(weekStart.getDate() + 6);
        eind.setHours(23, 59, 59, 999);
        params.set("van", weekStart.toISOString());
        params.set("tot", eind.toISOString());
      } else {
        params.set("van", new Date().toISOString());
      }
      if (typeFilter !== "alle") params.set("type", typeFilter);
      if (medewerkerFilter !== "alle") params.set("medewerker", medewerkerFilter);

      const res = await fetch(`/api/agenda?${params}`);
      if (res.ok) {
        const data: Afspraak[] = await res.json();
        setAfspraken(data);

        // Verzamel unieke types en medewerkers voor filters
        const types = [...new Set(data.map((a) => a.agtype).filter(Boolean))] as string[];
        const meds = [...new Set(data.map((a) => a.medewerkerFullname ?? a.agowner).filter(Boolean))] as string[];
        setAgTypes((prev) => [...new Set([...prev, ...types])]);
        setMedewerkers((prev) => [...new Set([...prev, ...meds])]);
      }
    } finally {
      setLoading(false);
    }
  }, [view, weekStart, typeFilter, medewerkerFilter]);

  useEffect(() => {
    laadAfspraken();
  }, [laadAfspraken]);

  async function enrichAfspraak(id: string) {
    setEnrichingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/agenda/${id}/enrich`, { method: "POST" });
      if (res.ok) {
        const updated: Afspraak = await res.json();
        setAfspraken((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function vorigeWeek() {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 7);
      return n;
    });
  }

  function volgendeWeek() {
    setWeekStart((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 7);
      return n;
    });
  }

  function vandaag() {
    setWeekStart(getMaandag(new Date()));
  }

  // Groepeer op dag (weekweergave)
  const dagenInWeek = Array.from({ length: 7 }, (_, i) => {
    const dag = new Date(weekStart);
    dag.setDate(weekStart.getDate() + i);
    return dag;
  });

  function afsprakenOpDag(dag: Date): Afspraak[] {
    return afspraken.filter((a) => {
      if (!a.agbegin) return false;
      const d = new Date(a.agbegin);
      return (
        d.getFullYear() === dag.getFullYear() &&
        d.getMonth() === dag.getMonth() &&
        d.getDate() === dag.getDate()
      );
    });
  }

  const isVandaag = (dag: Date) => {
    const nu = new Date();
    return (
      dag.getFullYear() === nu.getFullYear() &&
      dag.getMonth() === nu.getMonth() &&
      dag.getDate() === nu.getDate()
    );
  };

  return (
    <div className="flex flex-col gap-0 p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>

        <div className="flex items-center gap-2">
          {/* Weergave-tabs */}
          <div className="flex rounded-lg border border-gray-200 bg-white">
            <button
              onClick={() => setView("week")}
              className={`flex items-center gap-1.5 rounded-l-lg px-3 py-2 text-sm font-medium transition-colors ${
                view === "week"
                  ? "bg-primary text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <CalendarDaysIcon className="h-4 w-4" />
              Week
            </button>
            <button
              onClick={() => setView("lijst")}
              className={`flex items-center gap-1.5 rounded-r-lg px-3 py-2 text-sm font-medium transition-colors ${
                view === "lijst"
                  ? "bg-primary text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
              Lijst
            </button>
          </div>

          {/* Week navigatie (alleen bij weekweergave) */}
          {view === "week" && (
            <div className="flex items-center gap-1">
              <button
                onClick={vorigeWeek}
                className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                onClick={vandaag}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Vandaag
              </button>
              <button
                onClick={volgendeWeek}
                className="rounded-lg border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
              <span className="ml-2 text-sm text-gray-500">
                {weekStart.getDate()} {MAANDEN[weekStart.getMonth()]} –{" "}
                {weekEind.getDate()} {MAANDEN[weekEind.getMonth()]} {weekEind.getFullYear()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
        >
          <option value="alle">Alle types</option>
          {agTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={medewerkerFilter}
          onChange={(e) => setMedewerkerFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none"
        >
          <option value="alle">Alle medewerkers</option>
          {medewerkers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Inhoud */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : view === "week" ? (
        <WeekWeergave
          dagen={dagenInWeek}
          afsprakenOpDag={afsprakenOpDag}
          isVandaag={isVandaag}
          enrichingIds={enrichingIds}
          onEnrich={enrichAfspraak}
        />
      ) : (
        <LijstWeergave
          afspraken={afspraken}
          enrichingIds={enrichingIds}
          onEnrich={enrichAfspraak}
        />
      )}
    </div>
  );
}

// ── Week weergave ──────────────────────────────────────────────────────────────

function WeekWeergave({
  dagen,
  afsprakenOpDag,
  isVandaag,
  enrichingIds,
  onEnrich,
}: {
  dagen: Date[];
  afsprakenOpDag: (dag: Date) => Afspraak[];
  isVandaag: (dag: Date) => boolean;
  enrichingIds: Set<string>;
  onEnrich: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {dagen.map((dag, i) => {
        const afspraken = afsprakenOpDag(dag);
        const vandaag = isVandaag(dag);

        return (
          <div key={i}>
            {/* Dag-label */}
            <div className="mb-2 flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  vandaag ? "bg-primary text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {dag.getDate()}
              </div>
              <span className={`text-sm font-medium ${vandaag ? "text-primary" : "text-gray-500"}`}>
                {WEEKDAGEN[i]}{" "}
                {dag.getDate()} {["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"][dag.getMonth()]}
              </span>
            </div>

            {afspraken.length === 0 ? (
              <p className="mb-3 ml-10 text-xs text-gray-400">Geen afspraken</p>
            ) : (
              <div className="ml-10 flex flex-col gap-2">
                {afspraken.map((a) => (
                  <AfspraakKaart
                    key={a.id}
                    afspraak={a}
                    enriching={enrichingIds.has(a.id)}
                    onEnrich={onEnrich}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Lijst weergave ─────────────────────────────────────────────────────────────

function LijstWeergave({
  afspraken,
  enrichingIds,
  onEnrich,
}: {
  afspraken: Afspraak[];
  enrichingIds: Set<string>;
  onEnrich: (id: string) => void;
}) {
  if (afspraken.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        Geen komende afspraken gevonden.
      </div>
    );
  }

  // Groepeer op dag
  const groepen = new Map<string, Afspraak[]>();
  for (const a of afspraken) {
    const key = a.agbegin ? new Date(a.agbegin).toDateString() : "onbekend";
    if (!groepen.has(key)) groepen.set(key, []);
    groepen.get(key)!.push(a);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groepen.entries()].map(([key, items]) => (
        <div key={key}>
          <p className="mb-2 text-sm font-medium text-gray-500">
            {formatDatum(items[0].agbegin)}
          </p>
          <div className="flex flex-col gap-2">
            {items.map((a) => (
              <AfspraakKaart
                key={a.id}
                afspraak={a}
                enriching={enrichingIds.has(a.id)}
                onEnrich={onEnrich}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Afspraak kaart ─────────────────────────────────────────────────────────────

function AfspraakKaart({
  afspraak: a,
  enriching,
  onEnrich,
}: {
  afspraak: Afspraak;
  enriching: boolean;
  onEnrich: (id: string) => void;
}) {
  const heeftContact = Boolean(a.contactNaam || a.contactEmail || a.contactTelefoon);
  const heeftTelefoon = Boolean(a.contactTelefoon);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Bovenste rij: tijd + type + omschrijving */}
      <div className="flex items-start gap-3">
        <div className="min-w-[52px] text-sm font-semibold text-primary">
          {formatTijd(a.agbegin)}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {a.agtype && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeKleur(a.agtype)}`}>
                {a.agtype}
              </span>
            )}
            <span className="font-medium text-gray-900">{a.agdescr || "Afspraak"}</span>
          </div>

          {/* Locatie */}
          {a.aglocation && (
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0" />
              {a.aglocation}
            </div>
          )}

          {/* Medewerker */}
          {(a.medewerkerFullname || a.agowner) && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <UserIcon className="h-3 w-3 flex-shrink-0" />
              {a.medewerkerFullname ?? a.agowner}
            </div>
          )}

          {/* Enriched contact info */}
          {heeftContact && (
            <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              {a.contactNaam && (
                <p className="font-medium text-gray-800">{a.contactNaam}</p>
              )}
              {a.contactEmail && (
                <p className="text-gray-500">{a.contactEmail}</p>
              )}
              {a.contactTelefoon && (
                <p className="text-gray-500">{a.contactTelefoon}</p>
              )}
              {a.project && (
                <div className="mt-1 flex items-center gap-1 text-xs text-primary">
                  <BuildingOfficeIcon className="h-3.5 w-3.5" />
                  {a.project.name}
                  {(a.project.woningAdres || a.project.woningPlaats) && (
                    <span className="text-gray-400">
                      · {[a.project.woningAdres, a.project.woningPlaats].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Memo */}
          {a.agmemo && (
            <p className="mt-1 text-xs text-gray-400 line-clamp-2">{a.agmemo}</p>
          )}
        </div>

        {/* Rcode badge */}
        {a.agrcode && (
          <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-400">
            {a.agrcode}
          </span>
        )}
      </div>

      {/* Actieknoppen */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {/* Meer info */}
        <button
          onClick={() => onEnrich(a.id)}
          disabled={enriching || !a.agrcode}
          title={!a.agrcode ? "Geen Rcode beschikbaar voor dit contact" : "Haal contactgegevens op uit Mautic"}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            enriching
              ? "cursor-wait bg-gray-100 text-gray-400"
              : !a.agrcode
              ? "cursor-not-allowed bg-gray-50 text-gray-300"
              : heeftContact
              ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {enriching ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <InformationCircleIcon className="h-3.5 w-3.5" />
          )}
          {heeftContact ? "Vernieuwen" : "Meer info"}
        </button>

        {/* Bellen */}
        {heeftTelefoon && (
          <a
            href={`tel:${a.contactTelefoon}`}
            className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            <PhoneIcon className="h-3.5 w-3.5" />
            Bellen
          </a>
        )}

        {/* WhatsApp */}
        {heeftTelefoon && (
          <a
            href={`https://wa.me/${normalizeWhatsApp(a.contactTelefoon!)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-[#25D366]/10 px-3 py-1.5 text-xs font-medium text-[#128C7E] transition-colors hover:bg-[#25D366]/20"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
