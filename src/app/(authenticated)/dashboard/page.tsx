import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FireIcon,
  FolderIcon,
  PhoneIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import Greeting from "@/components/Greeting";
import { auth } from "@/lib/auth";
import { DashboardAction, DashboardTone, getDashboardOverview } from "@/lib/dashboardOverview";

const toneClasses: Record<DashboardTone, { badge: string; icon: string; border: string }> = {
  red: {
    badge: "bg-red-50 text-red-700 ring-red-200",
    icon: "bg-red-50 text-red-600",
    border: "border-red-200",
  },
  amber: {
    badge: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: "bg-amber-50 text-amber-600",
    border: "border-amber-200",
  },
  blue: {
    badge: "bg-blue-50 text-blue-700 ring-blue-200",
    icon: "bg-blue-50 text-blue-600",
    border: "border-blue-200",
  },
  green: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: "bg-emerald-50 text-emerald-600",
    border: "border-emerald-200",
  },
  gray: {
    badge: "bg-gray-50 text-gray-700 ring-gray-200",
    icon: "bg-gray-50 text-gray-600",
    border: "border-gray-200",
  },
};

const actionIcons: Record<string, typeof ChatBubbleLeftRightIcon> = {
  "WhatsApp concept": ChatBubbleLeftRightIcon,
  "WhatsApp mislukt": ChatBubbleLeftRightIcon,
  "Voorstel akkoord": DocumentCheckIcon,
  "Voorstel bekeken": EyeIcon,
  "Voorstelfout": ExclamationTriangleIcon,
  "Agenda zonder contact": CalendarDaysIcon,
  "Agenda zonder project": CalendarDaysIcon,
  "Agenda controleren": CalendarDaysIcon,
  "Bezichtiging opvolgen": ChatBubbleLeftRightIcon,
  "Systeemcontrole": WrenchScrewdriverIcon,
  "Taak": ClipboardDocumentListIcon,
  "Kans": FireIcon,
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  if (!seconds) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}u ${rest}m`;
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const content = (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
  return href ? <Link href={href} className="block hover:border-primary">{content}</Link> : content;
}

function ActionIcon({ action }: { action: DashboardAction }) {
  const Icon = actionIcons[action.label] || ClockIcon;
  const tone = toneClasses[action.tone];
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${tone.icon}`}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function ActionList({ actions }: { actions: DashboardAction[] }) {
  if (actions.length === 0) {
    return (
      <section className="border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="font-semibold text-emerald-950">Geen directe acties</h2>
            <p className="text-sm text-emerald-800">Er staat nu niets met spoed bovenaan.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Direct doen</h2>
          <p className="mt-1 text-sm text-gray-500">Gesorteerd op wat nu de meeste aandacht vraagt.</p>
        </div>
        <span className="bg-primary px-3 py-1 text-sm font-semibold text-white">{actions.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {actions.map((action) => {
          const tone = toneClasses[action.tone];
          return (
            <Link
              key={action.id}
              href={action.href}
              className={`grid gap-3 border-l-4 px-5 py-4 transition-colors hover:bg-gray-50 md:grid-cols-[auto_1fr_auto] ${tone.border}`}
            >
              <ActionIcon action={action} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold ring-1 ring-inset ${tone.badge}`}>
                    {action.label}
                  </span>
                  <h3 className="truncate font-semibold text-gray-950">{action.title}</h3>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{action.meta}</p>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                {action.cta}
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const overview = await getDashboardOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Greeting name={session?.user?.name?.split(" ")[0]} />
          <p className="mt-1 text-gray-500">
            Vandaag in kantoor: concepten, voorstellen, agenda en systeemsignalen.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Bijgewerkt {formatDateTime(overview.generatedAt)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Directe acties" value={overview.stats.actions} />
        <Stat label="WhatsApp concepten" value={overview.stats.whatsappConcepts} href="/digitale-medewerker" />
        <Stat label="Lopende voorstellen" value={overview.stats.openProposals} href="/projecten" />
        <Stat label="Akkoord te verwerken" value={overview.stats.acceptedProposals} href="/projecten" />
        <Stat label="Agenda issues" value={overview.stats.agendaIssues} href="/agenda" />
      </div>

      <ActionList actions={overview.actions} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">Lopende voorstellen</h2>
              <p className="mt-1 text-sm text-gray-500">Laatste opening, sessies en actieve tijd.</p>
            </div>
            <Link href="/projecten" className="text-sm font-semibold text-primary hover:underline">
              Alle projecten
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {overview.proposals.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-500">Geen lopende voorstellen.</p>
            )}
            {overview.proposals.map((proposal) => (
              <Link key={proposal.id} href={proposal.href} className="block px-5 py-4 hover:bg-gray-50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-gray-950">{proposal.projectName}</h3>
                      <span className="bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                        {proposal.projectType}
                      </span>
                      {proposal.needsOfficeAction && (
                        <span className="bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          actie nodig
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {proposal.status === "ACCEPTED"
                        ? `Akkoord ${formatDateTime(proposal.acceptedAt)}`
                        : proposal.lastViewedAt
                          ? `Laatst bekeken ${formatDateTime(proposal.lastViewedAt)}`
                          : "Nog niet bekeken"}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-right text-sm">
                    <div>
                      <p className="font-semibold text-gray-900">{proposal.viewCount}</p>
                      <p className="text-xs text-gray-400">openingen</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{proposal.sessionCount}</p>
                      <p className="text-xs text-gray-400">sessies</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{formatDuration(proposal.activeSeconds)}</p>
                      <p className="text-xs text-gray-400">actief</p>
                    </div>
                  </div>
                </div>
                {proposal.lastEventLabel && (
                  <p className="mt-2 text-xs text-gray-400">{proposal.lastEventLabel}</p>
                )}
              </Link>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Vandaag en morgen</h2>
              <p className="mt-1 text-sm text-gray-500">Agenda-items die handig zijn om kort te scannen.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {overview.agenda.length === 0 && (
                <p className="px-5 py-6 text-sm text-gray-500">Geen agenda-items met aandacht.</p>
              )}
              {overview.agenda.map((item) => (
                <Link key={item.id} href={item.href} className="block px-5 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {[item.time, item.contactName, item.projectName].filter(Boolean).join(" · ") || "-"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-1 text-xs font-semibold ${
                        item.status === "ok"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section
            className={`border bg-white ${
              overview.system.status === "ok" ? "border-emerald-200" : "border-amber-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">Systeemstatus</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {overview.system.status === "ok" ? "Geen blokkades zichtbaar." : "Er staat iets open om te controleren."}
                </p>
              </div>
              <Link href="/systeemcontrole" className="text-sm font-semibold text-primary hover:underline">
                Openen
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 p-5 text-sm">
              <div>
                <p className="text-gray-500">Quarantaine</p>
                <p className="font-semibold text-gray-900">{overview.system.openQuarantine}</p>
              </div>
              <div>
                <p className="text-gray-500">Syncfouten 24u</p>
                <p className="font-semibold text-gray-900">{overview.system.failedSync24h}</p>
              </div>
              <div>
                <p className="text-gray-500">Queue pending</p>
                <p className="font-semibold text-gray-900">{overview.system.pendingQueue}</p>
              </div>
              <div>
                <p className="text-gray-500">Queue fouten</p>
                <p className="font-semibold text-gray-900">{overview.system.failedQueue}</p>
              </div>
              <div className="col-span-2 border-t border-gray-100 pt-3">
                <p className="text-gray-500">Laatste Realworks capture</p>
                <p className="font-semibold text-gray-900">{formatDateTime(overview.system.latestBackupCaptureAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">Laatste bezichtiging-follow-up run</p>
                <p className="font-semibold text-gray-900">{formatDateTime(overview.system.followUpLastRunAt)}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/kansen"
              className="group border border-gray-200 bg-white p-4 transition-colors hover:border-primary/30 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <FireIcon className="h-5 w-5 text-red-600" />
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary">Kansen</h3>
                  <p className="text-sm text-gray-500">Actieve interesse</p>
                </div>
              </div>
            </Link>
            <Link
              href="/telefonie"
              className="group border border-gray-200 bg-white p-4 transition-colors hover:border-primary/30 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <PhoneIcon className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary">Telefonie</h3>
                  <p className="text-sm text-gray-500">Gesprekken</p>
                </div>
              </div>
            </Link>
            <Link
              href="/projecten"
              className="group border border-gray-200 bg-white p-4 transition-colors hover:border-primary/30 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <FolderIcon className="h-5 w-5 text-amber-600" />
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary">Projecten</h3>
                  <p className="text-sm text-gray-500">Dossiers</p>
                </div>
              </div>
            </Link>
            <a
              href="/api/debiteuren/login"
              target="_blank"
              rel="noopener noreferrer"
              className="group border border-gray-200 bg-white p-4 transition-colors hover:border-primary/30 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <ClipboardDocumentListIcon className="h-5 w-5 text-purple-600" />
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-primary">Facturatie</h3>
                  <p className="text-sm text-gray-500">Debiteuren</p>
                </div>
              </div>
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
