import type { DebiteurenInvoiceCreateV1 } from "./debiteuren";

export type TaxatieInvoiceProject = {
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

export type BuildTaxatieInvoicePayloadResult =
  | { ok: true; payload: DebiteurenInvoiceCreateV1; idempotencyKey: string }
  | { ok: false; status: number; error: string };

export function getTaxatieInvoiceIdempotencyKey(projectId: string) {
  return `project:${projectId}:taxatie-invoice:v1`;
}

export function buildTaxatieInvoicePayload(
  project: TaxatieInvoiceProject,
  input: unknown
): BuildTaxatieInvoicePayloadResult {
  if (project.type !== "TAXATIE") {
    return { ok: false, status: 400, error: "Factuuractie is nu alleen voor taxatieprojecten beschikbaar" };
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
  const address = [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ");
  const subject = clippedSubject(text(body.subject) ?? `Taxatie ${address || project.name}`);
  const description = text(body.description) ?? "Taxatierapport";
  const bank = body.bank === "abn" ? "abn" : "rabo";

  return {
    ok: true,
    idempotencyKey: getTaxatieInvoiceIdempotencyKey(project.id),
    payload: {
      contractVersion: "InvoiceCreateV1",
      source: "devree-platform",
      customerId: project.debiteurenLink.debiteurenKlantId,
      invoiceType: "taxatie",
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
