import { ProjectStatus, ProjectType } from "@prisma/client";
import { isBezichtigingType } from "@/lib/agendaEnrich";
import { getBezichtigingFollowUpLastRun } from "@/lib/bezichtigingFollowUp";
import { prisma } from "@/lib/prisma";

export type DashboardTone = "red" | "amber" | "blue" | "green" | "gray";

export interface DashboardAction {
  id: string;
  priority: number;
  tone: DashboardTone;
  label: string;
  title: string;
  meta: string;
  href: string;
  cta: string;
  createdAt?: string | null;
}

export interface DashboardProposal {
  id: string;
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  projectStatus: ProjectStatus | null;
  status: string;
  publicUrl: string | null;
  href: string;
  createdAt: string;
  expiresAt: string | null;
  lastViewedAt: string | null;
  acceptedAt: string | null;
  viewCount: number;
  sessionCount: number;
  activeSeconds: number;
  lastEventLabel: string | null;
  needsOfficeAction: boolean;
}

export interface DashboardAgendaItem {
  id: string;
  title: string;
  time: string | null;
  contactName: string | null;
  projectName: string | null;
  status: "ok" | "no_contact" | "no_project" | "needs_review" | "conflict" | "error";
  href: string;
}

export interface DashboardSystemHealth {
  status: "ok" | "attention";
  openQuarantine: number;
  failedSync24h: number;
  failedQueue: number;
  pendingQueue: number;
  latestBackupCaptureAt: string | null;
  followUpLastRunAt: string | null;
}

export interface DashboardOverview {
  generatedAt: string;
  stats: {
    actions: number;
    whatsappConcepts: number;
    openProposals: number;
    acceptedProposals: number;
    agendaIssues: number;
  };
  actions: DashboardAction[];
  proposals: DashboardProposal[];
  agenda: DashboardAgendaItem[];
  system: DashboardSystemHealth;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function hoursAgo(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 3_600_000);
}

function relativeLabel(value: Date | null | undefined, now: Date) {
  if (!value) return "geen datum";
  const diffMs = now.getTime() - value.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "zojuist";
  if (diffMinutes < 60) return `${diffMinutes} min geleden`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} uur geleden`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "gisteren";
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit" }).format(value);
}

function compactDateTime(value: Date | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function agendaStatus(item: {
  enrichmentStatus: string | null;
  projectId: string | null;
  mauticContactId: number | null;
  contactEmail: string | null;
  contactTelefoon: string | null;
}): DashboardAgendaItem["status"] {
  if (["conflict", "needs_review", "error"].includes(item.enrichmentStatus || "")) {
    return item.enrichmentStatus as DashboardAgendaItem["status"];
  }
  if (!item.mauticContactId && !item.contactEmail && !item.contactTelefoon) return "no_contact";
  if (!item.projectId) return "no_project";
  return "ok";
}

function isAcuteAgendaStatus(status: DashboardAgendaItem["status"]) {
  return status === "conflict" || status === "needs_review" || status === "error";
}

function actionKey(prefix: string, id: string) {
  return `${prefix}:${id}`;
}

function dedupeAndSortActions(actions: DashboardAction[]) {
  const seen = new Set<string>();
  return actions
    .filter((action) => {
      if (seen.has(action.id)) return false;
      seen.add(action.id);
      return true;
    })
    .sort((a, b) => a.priority - b.priority || (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 10);
}

async function queueCounts() {
  const [relation, taxatie, woning] = await Promise.all([
    prisma.realworksTask.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.realworksTaxatieTask.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.realworksWoningTask.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const all = [...relation, ...taxatie, ...woning];
  return all.reduce(
    (acc, row) => {
      if (row.status === "failed") acc.failed += row._count._all;
      if (row.status === "pending" || row.status === "processing") acc.pending += row._count._all;
      return acc;
    },
    { failed: 0, pending: 0 },
  );
}

export async function getDashboardOverview(now = new Date()): Promise<DashboardOverview> {
  const today = startOfDay(now);
  const tomorrowEnd = addDays(today, 2);
  const since24h = hoursAgo(now, 24);
  const viewingFollowUpFrom = hoursAgo(now, 72);
  const viewingFollowUpTo = hoursAgo(now, 12);

  const [
    whatsappDrafts,
    proposalsRaw,
    agendaRaw,
    recentAgendaRaw,
    openTasks,
    opportunities,
    openQuarantine,
    failedSync24h,
    latestBackupCapture,
    queues,
    followUpLastRun,
  ] = await Promise.all([
    prisma.followUpDraft.findMany({
      where: { channel: "whatsapp", status: { in: ["draft", "failed"] } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        purpose: true,
        status: true,
        recipientName: true,
        recipientPhone: true,
        projectId: true,
        agendaAfspraakId: true,
        createdAt: true,
      },
    }),
    prisma.projectProposal.findMany({
      where: { status: { in: ["OPEN", "ACCEPTED", "ERROR"] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 30,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            type: true,
            projectStatus: true,
            woningAdres: true,
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 80,
          select: { eventType: true, sessionId: true, activeSeconds: true, createdAt: true },
        },
      },
    }),
    prisma.agendaAfspraak.findMany({
      where: {
        agbegin: { gte: today, lt: tomorrowEnd },
        NOT: { aginactive: true },
      },
      orderBy: { agbegin: "asc" },
      take: 80,
      include: {
        project: { select: { id: true, name: true, woningAdres: true } },
        lead: { select: { naam: true } },
      },
    }),
    prisma.agendaAfspraak.findMany({
      where: {
        agbegin: { gte: viewingFollowUpFrom, lte: viewingFollowUpTo },
        NOT: { aginactive: true },
      },
      orderBy: { agbegin: "desc" },
      take: 80,
      include: {
        project: { select: { id: true, name: true, woningAdres: true } },
        lead: { select: { naam: true } },
      },
    }),
    prisma.task.findMany({
      where: { status: { in: ["open", "bezig"] }, dueDate: { lte: tomorrowEnd } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 8,
      select: { id: true, title: true, priority: true, dueDate: true, projectId: true },
    }),
    prisma.actionOpportunity.findMany({
      where: { status: "open" },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: {
        id: true,
        priority: true,
        title: true,
        contactName: true,
        objectAddress: true,
        createdAt: true,
      },
    }),
    prisma.realworksSyncQuarantine.count({ where: { status: "open" } }),
    prisma.realworksSyncEvent.count({
      where: { status: "failed", createdAt: { gte: since24h } },
    }),
    prisma.realworksBackupCapture.findFirst({
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
    queueCounts(),
    getBezichtigingFollowUpLastRun().catch(() => null),
  ]);

  const projectIds = [...new Set(whatsappDrafts.map((draft) => draft.projectId).filter(Boolean) as string[])];
  const draftProjects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, woningAdres: true },
      })
    : [];
  const draftProjectMap = new Map(draftProjects.map((project) => [project.id, project]));

  const followUpDraftAfspraakIds = new Set(
    (
      await prisma.followUpDraft.findMany({
        where: {
          agendaAfspraakId: { in: recentAgendaRaw.map((item) => item.id) },
          purpose: "bezichtiging_followup",
        },
        select: { agendaAfspraakId: true },
      })
    )
      .map((draft) => draft.agendaAfspraakId)
      .filter(Boolean) as string[],
  );

  const proposals: DashboardProposal[] = proposalsRaw
    .map((proposal) => {
      const sessions = new Set(proposal.events.map((event) => event.sessionId).filter(Boolean));
      const activeSeconds = proposal.events.reduce((sum, event) => sum + (event.activeSeconds || 0), 0);
      const latestEvent = proposal.events[0];
      const needsOfficeAction =
        proposal.status === "ACCEPTED"
        && (!proposal.documensoDocumentId || proposal.project.projectStatus !== ProjectStatus.OTD_ONDERTEKEND);

      return {
        id: proposal.id,
        projectId: proposal.projectId,
        projectName: proposal.project.woningAdres || proposal.project.name,
        projectType: proposal.project.type,
        projectStatus: proposal.project.projectStatus,
        status: proposal.status,
        publicUrl: proposal.publicUrl,
        href: `/projecten/${proposal.projectId}?tab=dossier`,
        createdAt: proposal.createdAt.toISOString(),
        expiresAt: proposal.expiresAt?.toISOString() ?? null,
        lastViewedAt: proposal.lastViewedAt?.toISOString() ?? proposal.viewedAt?.toISOString() ?? null,
        acceptedAt: proposal.acceptedAt?.toISOString() ?? null,
        viewCount: proposal.viewCount,
        sessionCount: sessions.size,
        activeSeconds,
        lastEventLabel: latestEvent ? `${latestEvent.eventType} · ${relativeLabel(latestEvent.createdAt, now)}` : null,
        needsOfficeAction,
      };
    })
    .sort((a, b) => {
      if (a.needsOfficeAction !== b.needsOfficeAction) return a.needsOfficeAction ? -1 : 1;
      if (a.acceptedAt !== b.acceptedAt) return (b.acceptedAt || "").localeCompare(a.acceptedAt || "");
      return (b.lastViewedAt || b.createdAt).localeCompare(a.lastViewedAt || a.createdAt);
    })
    .slice(0, 6);

  const agenda = agendaRaw
    .filter((item) => isBezichtigingType(item.agtype) || item.enrichmentStatus || !item.projectId || !item.mauticContactId)
    .map((item): DashboardAgendaItem => {
      const status = agendaStatus(item);
      return {
        id: item.id,
        title: item.agdescr || item.aglocation || "Afspraak",
        time: compactDateTime(item.agbegin),
        contactName: item.contactNaam || item.lead?.naam || null,
        projectName: item.project?.woningAdres || item.project?.name || null,
        status,
        href: `/agenda?afspraak=${encodeURIComponent(item.id)}`,
      };
    })
    .filter((item) => isAcuteAgendaStatus(item.status))
    .sort((a, b) => (a.status === "ok" ? 1 : 0) - (b.status === "ok" ? 1 : 0))
    .slice(0, 5);

  const actions: DashboardAction[] = [];

  for (const draft of whatsappDrafts) {
    const project = draft.projectId ? draftProjectMap.get(draft.projectId) : null;
    actions.push({
      id: actionKey("draft", draft.id),
      priority: draft.status === "failed" ? 1 : 2,
      tone: draft.status === "failed" ? "red" : "amber",
      label: draft.status === "failed" ? "WhatsApp mislukt" : "WhatsApp concept",
      title: draft.recipientName || draft.recipientPhone || "Concept beoordelen",
      meta: [project?.woningAdres || project?.name, draft.purpose, relativeLabel(draft.createdAt, now)].filter(Boolean).join(" · "),
      href: "/digitale-medewerker",
      cta: "Beoordelen",
      createdAt: draft.createdAt.toISOString(),
    });
  }

  for (const proposal of proposals) {
    if (proposal.needsOfficeAction) {
      actions.push({
        id: actionKey("proposal-accepted", proposal.id),
        priority: 1,
        tone: "green",
        label: "Voorstel akkoord",
        title: proposal.projectName,
        meta: `Akkoord ${relativeLabel(proposal.acceptedAt ? new Date(proposal.acceptedAt) : null, now)} · OTD/Documenso controleren`,
        href: proposal.href,
        cta: "Dossier openen",
        createdAt: proposal.acceptedAt,
      });
    } else if (proposal.status === "OPEN" && proposal.lastViewedAt && new Date(proposal.lastViewedAt) >= hoursAgo(now, 48)) {
      actions.push({
        id: actionKey("proposal-viewed", proposal.id),
        priority: 5,
        tone: "blue",
        label: "Voorstel bekeken",
        title: proposal.projectName,
        meta: `${proposal.viewCount} opening${proposal.viewCount === 1 ? "" : "en"} · laatste ${relativeLabel(new Date(proposal.lastViewedAt), now)}`,
        href: proposal.href,
        cta: "Bekijken",
        createdAt: proposal.lastViewedAt,
      });
    } else if (proposal.status === "ERROR") {
      actions.push({
        id: actionKey("proposal-error", proposal.id),
        priority: 2,
        tone: "red",
        label: "Voorstelfout",
        title: proposal.projectName,
        meta: "Concept of voorstel heeft een foutstatus",
        href: proposal.href,
        cta: "Controleren",
        createdAt: proposal.createdAt,
      });
    }
  }

  for (const item of agenda) {
    actions.push({
      id: actionKey("agenda", item.id),
      priority: item.status === "error" || item.status === "conflict" ? 2 : 4,
      tone: item.status === "error" || item.status === "conflict" ? "red" : "amber",
      label: "Agenda controleren",
      title: item.title,
      meta: [item.time, item.contactName, item.projectName].filter(Boolean).join(" · "),
      href: item.href,
      cta: "Agenda openen",
      createdAt: item.time,
    });
  }

  for (const viewing of recentAgendaRaw.filter((item) => isBezichtigingType(item.agtype))) {
    if (followUpDraftAfspraakIds.has(viewing.id)) continue;
    actions.push({
      id: actionKey("viewing-followup", viewing.id),
      priority: 4,
      tone: "amber",
      label: "Bezichtiging opvolgen",
      title: viewing.contactNaam || viewing.lead?.naam || viewing.agdescr || "Kijker",
      meta: [viewing.project?.woningAdres || viewing.project?.name || viewing.aglocation, relativeLabel(viewing.agbegin, now)].filter(Boolean).join(" · "),
      href: "/digitale-medewerker",
      cta: "Concepten maken",
      createdAt: viewing.agbegin?.toISOString(),
    });
  }

  for (const task of openTasks) {
    actions.push({
      id: actionKey("task", task.id),
      priority: task.priority === "urgent" ? 2 : task.priority === "hoog" ? 4 : 7,
      tone: task.priority === "urgent" ? "red" : "gray",
      label: "Taak",
      title: task.title,
      meta: task.dueDate ? `deadline ${relativeLabel(task.dueDate, now)}` : "open taak",
      href: task.projectId ? `/projecten/${task.projectId}` : "/taken",
      cta: "Openen",
      createdAt: task.dueDate?.toISOString(),
    });
  }

  for (const opportunity of opportunities) {
    actions.push({
      id: actionKey("opportunity", opportunity.id),
      priority: opportunity.priority === "urgent" ? 3 : opportunity.priority === "high" ? 5 : 8,
      tone: opportunity.priority === "urgent" ? "red" : "blue",
      label: "Kans",
      title: opportunity.title,
      meta: [opportunity.contactName, opportunity.objectAddress, relativeLabel(opportunity.createdAt, now)].filter(Boolean).join(" · "),
      href: "/kansen",
      cta: "Kans bekijken",
      createdAt: opportunity.createdAt.toISOString(),
    });
  }

  if (openQuarantine > 0 || failedSync24h > 0 || queues.failed > 0) {
    actions.push({
      id: "system:attention",
      priority: 1,
      tone: "red",
      label: "Systeemcontrole",
      title: "Sync of datakwaliteit vraagt aandacht",
      meta: `${openQuarantine} quarantaine · ${failedSync24h} syncfouten · ${queues.failed} queuefouten`,
      href: "/systeemcontrole",
      cta: "Controleren",
      createdAt: now.toISOString(),
    });
  }

  const sortedActions = dedupeAndSortActions(actions);
  const agendaIssues = agenda.length;
  const followUpLastRunAt =
    followUpLastRun && typeof followUpLastRun === "object" && !Array.isArray(followUpLastRun) && "at" in followUpLastRun
      ? String((followUpLastRun as { at?: unknown }).at || "")
      : null;

  return {
    generatedAt: now.toISOString(),
    stats: {
      actions: sortedActions.length,
      whatsappConcepts: whatsappDrafts.length,
      openProposals: proposals.filter((proposal) => proposal.status === "OPEN").length,
      acceptedProposals: proposals.filter((proposal) => proposal.needsOfficeAction).length,
      agendaIssues,
    },
    actions: sortedActions,
    proposals,
    agenda,
    system: {
      status: openQuarantine > 0 || failedSync24h > 0 || queues.failed > 0 ? "attention" : "ok",
      openQuarantine,
      failedSync24h,
      failedQueue: queues.failed,
      pendingQueue: queues.pending,
      latestBackupCaptureAt: latestBackupCapture?.receivedAt.toISOString() ?? null,
      followUpLastRunAt,
    },
  };
}
