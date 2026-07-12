import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FireIcon,
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
  "Agenda controleren": CalendarDaysIcon,
  "Bezichtiging opvolgen": ChatBubbleLeftRightIcon,
  "Systeemcontrole": WrenchScrewdriverIcon,
  "Taak": ClockIcon,
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
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}u ${minutes % 60}m`;
}

function MetricPill({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const content = (
    <span className="inline-flex items-center gap-2 border border-gray-200 bg-white px-3 py-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-950">{value}</span>
    </span>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ActionIcon({ action }: { action: DashboardAction }) {
  const Icon = actionIcons[action.label] || ClockIcon;
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center ${toneClasses[action.tone].icon}`}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function ActionList({ actions }: { actions: DashboardAction[] }) {
  const primaryActions = actions.slice(0, 6);

  if (primaryActions.length === 0) {
    return (
      <section className="border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="font-semibold text-emerald-950">Rustig begin</h2>
            <p className="text-sm text-emerald-800">Geen directe actie die nu bovenaan hoeft.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Eerst doen</h2>
          <p className="mt-1 text-sm text-gray-500">Alleen de belangrijkste acties, maximaal zes.</p>
        </div>
        <span className="bg-primary px-3 py-1 text-sm font-semibold text-white">{primaryActions.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {primaryActions.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className={`grid gap-3 border-l-4 px-5 py-3 transition-colors hover:bg-gray-50 md:grid-cols-[auto_1fr_auto] ${toneClasses[action.tone].border}`}
          >
            <ActionIcon action={action} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold ring-1 ring-inset ${toneClasses[action.tone].badge}`}>
                  {action.label}
                </span>
                <h3 className="truncate font-semibold text-gray-950">{action.title}</h3>
              </div>
              <p className="mt-1 truncate text-sm text-gray-500">{action.meta}</p>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              {action.cta}
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const overview = await getDashboardOverview();
  const proposalPreview = overview.proposals.slice(0, 3);
  const agendaPreview = overview.agenda.slice(0, 4);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Greeting name={session?.user?.name?.split(" ")[0]} />
          <p className="mt-1 text-gray-500">Wat vraagt vandaag aandacht?</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MetricPill label="WhatsApp" value={overview.stats.whatsappConcepts} href="/digitale-medewerker" />
          <MetricPill label="Voorstellen" value={overview.stats.openProposals} href="/projecten" />
          <MetricPill label="Agenda urgent" value={overview.stats.agendaIssues} href="/agenda" />
          <MetricPill label="Bijgewerkt" value={formatDateTime(overview.generatedAt)} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ActionList actions={overview.actions} />

        <aside className="space-y-5">
          <section className="border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="font-semibold text-gray-900">Voorstellen</h2>
              <Link href="/projecten" className="text-sm font-semibold text-primary hover:underline">
                Openen
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {proposalPreview.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">Geen lopende voorstellen.</p>}
              {proposalPreview.map((proposal) => (
                <Link key={proposal.id} href={proposal.href} className="block px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{proposal.projectName}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {proposal.status === "ACCEPTED"
                          ? `Akkoord ${formatDateTime(proposal.acceptedAt)}`
                          : proposal.lastViewedAt
                            ? `Bekeken ${formatDateTime(proposal.lastViewedAt)}`
                            : "Nog niet bekeken"}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-xs text-gray-400">
                      {proposal.viewCount}x
                      <br />
                      {formatDuration(proposal.activeSeconds)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="font-semibold text-gray-900">Agenda urgent</h2>
              <Link href="/agenda" className="text-sm font-semibold text-primary hover:underline">
                Vandaag
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {agendaPreview.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">Geen acute agendafouten.</p>}
              {agendaPreview.map((item) => (
                <Link key={item.id} href={item.href} className="block px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {[item.time, item.contactName, item.projectName].filter(Boolean).join(" · ") || "-"}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 text-xs font-semibold ${
                      item.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className={`border bg-white px-4 py-3 ${
            overview.system.status === "ok" ? "border-emerald-200" : "border-amber-200"
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900">Systeem</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {overview.system.status === "ok"
                    ? "Geen blokkades zichtbaar."
                    : `${overview.system.openQuarantine} quarantaine · ${overview.system.failedSync24h} syncfouten`}
                </p>
              </div>
              <Link href="/systeemcontrole" className="text-sm font-semibold text-primary hover:underline">
                Check
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
