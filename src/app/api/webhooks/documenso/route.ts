import { NextRequest, NextResponse } from "next/server";
import { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SIGNED_EVENTS = new Set(["DOCUMENT_SIGNED", "DOCUMENT_COMPLETED"]);
const TERMINAL_OR_LATER_STATUSES = new Set<ProjectStatus>([
  "ACTIEF",
  "LIVE_FUNDA",
  "ONDER_BOD",
  "KOOPAKTE",
  "GEPASSEERD",
  "AFGEROND",
]);

function webhookSecret() {
  return process.env.DOCUMENSO_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET;
}

function bearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function isAuthorized(request: NextRequest, body: unknown) {
  const expected = webhookSecret();
  if (!expected) return false;

  const provided = [
    request.headers.get("x-documenso-secret"),
    request.headers.get("x-webhook-secret"),
    bearerToken(request.headers.get("authorization")),
    typeof body === "object" && body && "secret" in body ? String(body.secret) : null,
  ].filter(Boolean);

  return provided.includes(expected);
}

function payloadObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || !body) return {};
  const record = body as Record<string, unknown>;
  const payload = record.payload;
  return typeof payload === "object" && payload ? payload as Record<string, unknown> : record;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function projectIdFromExternalId(externalId: string | null) {
  const match = externalId?.match(/^devree-platform-project-(.+)$/);
  return match?.[1] || null;
}

function shouldMarkSigned(currentStatus: ProjectStatus | null) {
  if (!currentStatus) return true;
  return !TERMINAL_OR_LATER_STATUSES.has(currentStatus);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!isAuthorized(request, body)) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const payload = payloadObject(body);
  const bodyRecord = typeof body === "object" && body ? body as Record<string, unknown> : {};
  const event = stringValue(bodyRecord.event, payload.event);
  const documentId = numberValue(payload.id, payload.documentId, bodyRecord.documentId);
  const envelopeId = stringValue(payload.envelopeId, payload.envelope_id, bodyRecord.envelopeId);
  const externalId = stringValue(payload.externalId, bodyRecord.externalId);
  const status = stringValue(payload.status, bodyRecord.status);

  if (!event || (!SIGNED_EVENTS.has(event) && status !== "COMPLETED")) {
    return NextResponse.json({
      success: true,
      ignored: true,
      ignoredReason: "Documenso-event wijzigt de projectstatus niet",
      event,
      status,
    });
  }

  const proposal = documentId || envelopeId
    ? await prisma.projectProposal.findFirst({
      where: {
        OR: [
          ...(documentId ? [{ documensoDocumentId: documentId }] : []),
          ...(envelopeId ? [{ documensoEnvelopeId: envelopeId }] : []),
        ],
      },
      include: { project: true },
      orderBy: { updatedAt: "desc" },
    })
    : null;

  const projectId = proposal?.projectId || projectIdFromExternalId(externalId);
  if (!projectId) {
    return NextResponse.json(
      {
        error: "Geen projectkoppeling gevonden in Documenso-payload",
        event,
        documentId,
        envelopeId,
        externalId,
      },
      { status: 422 },
    );
  }

  const project = proposal?.project || await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json(
      {
        error: "Project niet gevonden",
        event,
        documentId,
        envelopeId,
        externalId,
        projectId,
      },
      { status: 404 },
    );
  }

  const now = new Date();
  const updatedProject = shouldMarkSigned(project.projectStatus)
    ? await prisma.project.update({
      where: { id: project.id },
      data: { projectStatus: "OTD_ONDERTEKEND" },
      select: { id: true, projectStatus: true },
    })
    : { id: project.id, projectStatus: project.projectStatus };

  if (proposal) {
    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: proposal.status === "OPEN" ? "ACCEPTED" : proposal.status,
        acceptedAt: proposal.acceptedAt || now,
        errorMessage: null,
      },
    });
  }

  return NextResponse.json({
    success: true,
    event,
    status,
    documentId,
    envelopeId,
    externalId,
    projectId: project.id,
    projectStatus: updatedProject.projectStatus,
    proposalId: proposal?.id || null,
  });
}
