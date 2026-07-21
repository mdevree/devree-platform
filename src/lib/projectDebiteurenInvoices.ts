import type { ProjectDebiteurenInvoice } from "@prisma/client";
import {
  getDebiteurenInvoice,
  getDebiteurenSharedLoginPath,
  isDebiteurenApiError,
  type DebiteurenFactuur,
} from "./debiteuren";
import { prisma } from "./prisma";

export function moneyToCents(value: number) {
  return Math.round(value * 100);
}

export function dateFromDebiteuren(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function statusFromDebiteurenFactuur(factuur: Pick<DebiteurenFactuur, "betaald" | "verlopen">) {
  if (factuur.betaald) return "paid";
  if (factuur.verlopen) return "overdue";
  return "open";
}

function invoiceSyncError(error: unknown) {
  if (isDebiteurenApiError(error) && error.status === 404) {
    return "Niet gevonden via InvoiceReadV1 in debiteurensysteem";
  }

  return error instanceof Error
    ? error.message
    : "Factuurstatus kon niet worden opgehaald";
}

export function serializeProjectDebiteurenInvoice(invoice: ProjectDebiteurenInvoice) {
  return {
    id: invoice.id,
    debiteurenKlantId: invoice.debiteurenKlantId,
    debiteurenFactuurId: invoice.debiteurenFactuurId,
    factuurnummer: invoice.factuurnummer,
    invoiceType: invoice.invoiceType,
    subject: invoice.subject,
    invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    amountExcl: invoice.amountExclCents / 100,
    amountIncl: invoice.amountInclCents / 100,
    status: invoice.status,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    overdue: invoice.overdue,
    hash: invoice.hash,
    idempotencyKey: invoice.idempotencyKey,
    lastSyncedAt: invoice.lastSyncedAt?.toISOString() ?? null,
    syncError: invoice.syncError,
    createdBy: invoice.createdBy,
    createdAt: invoice.createdAt.toISOString(),
    invoiceUrl: getDebiteurenSharedLoginPath(`/?page=facturen&action=bekijk&id=${invoice.debiteurenFactuurId}`),
  };
}

export async function syncProjectDebiteurenInvoices({
  projectId,
}: {
  projectId: string;
}) {
  const platformInvoices = await prisma.projectDebiteurenInvoice.findMany({
    where: { projectId },
  });
  if (platformInvoices.length === 0) return [];

  const now = new Date();

  await Promise.all(platformInvoices.map(async (invoice) => {
    try {
      const response = await getDebiteurenInvoice(invoice.debiteurenFactuurId);
      const factuur = response.invoice;
      if (!factuur) {
        return prisma.projectDebiteurenInvoice.update({
          where: { id: invoice.id },
          data: {
            lastSyncedAt: now,
            syncError: "Niet gevonden via InvoiceReadV1 in debiteurensysteem",
          },
        });
      }

      return prisma.projectDebiteurenInvoice.update({
        where: { id: invoice.id },
        data: {
          factuurnummer: factuur.factuurnummer,
          subject: factuur.betreft || invoice.subject,
          invoiceDate: dateFromDebiteuren(factuur.datum),
          dueDate: dateFromDebiteuren(factuur.vervaldatum),
          amountExclCents: moneyToCents(factuur.bedragExcl),
          amountInclCents: moneyToCents(factuur.bedragIncl),
          status: factuur.status || statusFromDebiteurenFactuur(factuur),
          paidAt: dateFromDebiteuren(factuur.betaaldOp),
          overdue: factuur.verlopen,
          hash: factuur.hash,
          lastSyncedAt: now,
          syncError: null,
        },
      });
    } catch (error) {
      return prisma.projectDebiteurenInvoice.update({
        where: { id: invoice.id },
        data: {
          lastSyncedAt: now,
          syncError: invoiceSyncError(error),
        },
      });
    }
  }));

  return prisma.projectDebiteurenInvoice.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}
