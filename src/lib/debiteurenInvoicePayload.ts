import type { DebiteurenInvoiceCreateV1 } from "./debiteuren";

export type ProjectInvoiceProject = {
  id: string;
  type: string;
  name: string;
  woningAdres: string | null;
  woningPostcode: string | null;
  woningPlaats: string | null;
  mauticContactId: number | null;
  contacts: Array<{
    mauticContactId: number;
    role: string;
    addedAt: Date;
  }>;
  debiteurenLink: {
    debiteurenKlantId: number;
  } | null;
};

export type TaxatieInvoiceProject = ProjectInvoiceProject;

export type ProjectInvoiceType = "taxatie" | "verkoop" | "aankoop";

export type BuildProjectInvoicePayloadResult =
  | { ok: true; payload: DebiteurenInvoiceCreateV1; idempotencyKey: string }
  | { ok: false; status: number; error: string };

export type BuildTaxatieInvoicePayloadResult = BuildProjectInvoicePayloadResult;

export function getTaxatieInvoiceIdempotencyKey(projectId: string) {
  return getProjectInvoiceIdempotencyKey(projectId, "taxatie");
}

export function getProjectInvoiceIdempotencyKey(projectId: string, invoiceType: ProjectInvoiceType) {
  return `project:${projectId}:${invoiceType}-invoice:v1`;
}

export function buildTaxatieInvoicePayload(
  project: ProjectInvoiceProject,
  input: unknown
): BuildTaxatieInvoicePayloadResult {
  return buildProjectInvoicePayload(project, input);
}

export function buildProjectInvoicePayload(
  project: ProjectInvoiceProject,
  input: unknown
): BuildProjectInvoicePayloadResult {
  const invoiceType = invoiceTypeFromProject(project.type);
  if (!invoiceType) {
    return { ok: false, status: 400, error: "Factuuractie is alleen voor taxatie-, verkoop- en aankoopprojecten beschikbaar" };
  }

  if (!project.debiteurenLink) {
    return { ok: false, status: 400, error: "Koppel eerst een debiteurenklant aan dit project" };
  }

  const body = isRecord(input) ? input : {};
  const amountExcl = money(body.amountExcl);
  if (amountExcl === null) {
    return { ok: false, status: 400, error: "amountExcl is verplicht en moet positief zijn" };
  }

  const opdrachtgever = project.contacts.find((contact) => contact.role === "opdrachtgever");
  const mauticContactId = opdrachtgever?.mauticContactId
    ?? project.contacts[0]?.mauticContactId
    ?? project.mauticContactId
    ?? null;
  const address = project.woningAdres
    ? [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ")
    : "";
  const defaults = invoiceDefaults(invoiceType, address || project.name);
  const subject = clippedSubject(text(body.subject) ?? defaults.subject);
  const description = text(body.description) ?? defaults.description;
  const bank = body.bank === "abn" ? "abn" : "rabo";

  return {
    ok: true,
    idempotencyKey: getProjectInvoiceIdempotencyKey(project.id, invoiceType),
    payload: {
      contractVersion: "InvoiceCreateV1",
      source: "devree-platform",
      customerId: project.debiteurenLink.debiteurenKlantId,
      invoiceType,
      subject,
      invoiceDate: dateOrNull(body.invoiceDate),
      dueDate: dateOrNull(body.dueDate),
      bank,
      lines: [
        {
          description,
          amountExcl,
          vatRate: 0.21,
        },
      ],
      extra: text(body.extra),
      reference: {
        platformProjectId: project.id,
        mauticContactId,
      },
    },
  };
}

function invoiceTypeFromProject(projectType: string): ProjectInvoiceType | null {
  if (projectType === "TAXATIE") return "taxatie";
  if (projectType === "VERKOOP") return "verkoop";
  if (projectType === "AANKOOP") return "aankoop";
  return null;
}

function invoiceDefaults(invoiceType: ProjectInvoiceType, projectLabel: string) {
  if (invoiceType === "verkoop") {
    return {
      subject: `Verkoopbegeleiding ${projectLabel}`,
      description: "Courtage verkoop",
    };
  }

  if (invoiceType === "aankoop") {
    return {
      subject: `Aankoopbegeleiding ${projectLabel}`,
      description: "Aankoopbegeleiding",
    };
  }

  return {
    subject: `Taxatie ${projectLabel}`,
    description: "Taxatierapport",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function money(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

function dateOrNull(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function clippedSubject(value: string) {
  return value.length > 255 ? value.slice(0, 252) + "..." : value;
}
