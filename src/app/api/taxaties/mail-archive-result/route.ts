import { NextRequest, NextResponse } from "next/server";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { projectStatusRank, type TaxatieArchiveStatus, type TaxatieChecklistSignal } from "@/lib/taxatieMail";

function cleanJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function defaultUserId() {
  const user = await prisma.user.findFirst({
    where: { active: true, OR: [{ email: "info@devreemakelaardij.nl" }, { role: "manager" }] },
    orderBy: [{ email: "asc" }],
  });
  return user?.id ?? null;
}

async function ensureChecklistTask(projectId: string, signal: TaxatieChecklistSignal, archiveId: string) {
  const assigneeId = await defaultUserId();
  if (!assigneeId) return null;

  const notionPageId = `taxatie-mail:${projectId}:${signal.key}`;
  const status = signal.action === "complete_task" ? "afgerond" : "open";
  const title = `[Taxatie checklist] ${signal.label}`;
  const description = [
    signal.evidence,
    "",
    `Automatisch bijgewerkt vanuit taxatie-mailarchief ${archiveId}.`,
    "Controleer bij twijfel het taxatiecontrole-overzicht op de projectpagina.",
  ].join("\n");

  const existing = await prisma.task.findFirst({ where: { notionPageId, projectId } });
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        title,
        description,
        status,
        priority: signal.action === "complete_task" ? existing.priority : "hoog",
        category: "taxatie",
        completedAt: status === "afgerond" ? new Date() : null,
      },
    });
  }

  return prisma.task.create({
    data: {
      title,
      description,
      status,
      priority: signal.action === "complete_task" ? "normaal" : "hoog",
      category: "taxatie",
      assigneeId,
      creatorId: assigneeId,
      projectId,
      notionPageId,
      completedAt: status === "afgerond" ? new Date() : null,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json() as {
    archiveId?: string;
    messageId?: string;
    mailbox?: string;
    archiveStatus?: TaxatieArchiveStatus;
    nextcloudPath?: string;
    error?: string;
  };

  const archive = body.archiveId
    ? await prisma.taxatieMailArchive.findUnique({ where: { id: body.archiveId }, include: { project: true } })
    : body.messageId && body.mailbox
      ? await prisma.taxatieMailArchive.findUnique({
          where: { messageId_mailbox: { messageId: body.messageId, mailbox: body.mailbox.toLowerCase() } },
          include: { project: true },
        })
      : null;

  if (!archive) {
    return NextResponse.json({ error: "Archiefrecord niet gevonden" }, { status: 404 });
  }

  const archiveStatus = body.archiveStatus || (body.error ? "failed" : "archived");
  const updatedArchive = await prisma.taxatieMailArchive.update({
    where: { id: archive.id },
    data: {
      archiveStatus,
      nextcloudPath: body.nextcloudPath || archive.nextcloudPath,
      error: body.error || null,
    },
  });

  const tasks = [];
  let projectUpdated = null;

  if (archiveStatus === "archived" && archive.projectId) {
    const signals = (Array.isArray(archive.checklistSignals) ? archive.checklistSignals : []) as unknown as TaxatieChecklistSignal[];
    for (const signal of signals) {
      if (signal.confidence === "hoog") {
        const task = await ensureChecklistTask(archive.projectId, signal, archive.id);
        if (task) tasks.push(task.id);
      }
    }

    if (archive.suggestedStatus && archive.project && projectStatusRank(archive.suggestedStatus) > projectStatusRank(archive.project.projectStatus)) {
      projectUpdated = await prisma.project.update({
        where: { id: archive.projectId },
        data: {
          projectStatus: archive.suggestedStatus as ProjectStatus,
          status: archive.suggestedStatus === "ACTIEF" ? "actief" : archive.project.status,
        },
        select: { id: true, projectStatus: true, status: true },
      });
    }
  }

  if (archiveStatus !== "archived") {
    const assigneeId = await defaultUserId();
    if (assigneeId) {
      await prisma.task.create({
        data: {
          title: `Controleer taxatiemail: ${archive.subject || archive.messageId}`,
          description: [
            `Status: ${archiveStatus}`,
            archive.error ? `Fout: ${archive.error}` : null,
            archive.nextcloudPath ? `Pad: ${archive.nextcloudPath}` : null,
          ].filter(Boolean).join("\n"),
          priority: "hoog",
          category: "taxatie",
          assigneeId,
          creatorId: assigneeId,
          projectId: archive.projectId,
          notionPageId: `taxatie-mail-review:${archive.id}`,
        },
      });
    }
  }

  return NextResponse.json({
    success: true,
    archive: cleanJson(updatedArchive),
    tasksUpdated: tasks,
    projectUpdated,
  });
}
