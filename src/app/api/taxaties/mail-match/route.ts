import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import {
  TAXATIE_TERMINAL_STATUSES,
  matchTaxatieMail,
  type TaxatieMailPayload,
} from "@/lib/taxatieMail";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function short(value: unknown, max = 191) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const payload = (await request.json()) as TaxatieMailPayload;
  const projects = await prisma.project.findMany({
    where: {
      type: "TAXATIE",
      OR: [
        { projectStatus: null },
        { projectStatus: { notIn: TAXATIE_TERMINAL_STATUSES } },
      ],
    },
    include: {
      hypotheekAdviseur: {
        select: { naam: true, bedrijf: true, email: true, telefoon: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 250,
  });

  const result = matchTaxatieMail(projects, payload);
  const archive = await prisma.taxatieMailArchive.upsert({
    where: {
      messageId_mailbox: {
        messageId: result.messageId,
        mailbox: result.mailbox,
      },
    },
    update: {
      fromEmail: short(payload.from),
      toEmail: short(payload.to),
      subject: short(payload.subject),
      receivedAt: parseDate(payload.receivedAt),
      projectId: result.selected?.projectId ?? null,
      matchStatus: result.status,
      archiveStatus: result.status === "matched" ? "pending" : "review_needed",
      matchScore: result.selected?.score ?? result.candidates[0]?.score ?? null,
      matchReasons: jsonValue(result.selected?.reasons ?? []),
      candidates: jsonValue(result.candidates),
      checklistSignals: jsonValue(result.classification.checklistSignals),
      suggestedSubfolder: result.classification.targetSubfolder,
      suggestedStatus: result.classification.suggestedProjectStatus,
      rawPayload: jsonValue(payload),
      error: null,
    },
    create: {
      messageId: result.messageId,
      mailbox: result.mailbox,
      fromEmail: short(payload.from),
      toEmail: short(payload.to),
      subject: short(payload.subject),
      receivedAt: parseDate(payload.receivedAt),
      projectId: result.selected?.projectId ?? null,
      matchStatus: result.status,
      archiveStatus: result.status === "matched" ? "pending" : "review_needed",
      matchScore: result.selected?.score ?? result.candidates[0]?.score ?? null,
      matchReasons: jsonValue(result.selected?.reasons ?? []),
      candidates: jsonValue(result.candidates),
      checklistSignals: jsonValue(result.classification.checklistSignals),
      suggestedSubfolder: result.classification.targetSubfolder,
      suggestedStatus: result.classification.suggestedProjectStatus,
      rawPayload: jsonValue(payload),
    },
  });

  return NextResponse.json({
    success: true,
    archiveId: archive.id,
    ...result,
    reviewUrl: result.selected
      ? `/projecten/${result.selected.projectId}?tab=taxatieControle`
      : "/projecten?type=TAXATIE",
  });
}
