import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import {
  createDebiteurenInvoice,
  getDebiteurenSharedLoginPath,
  isDebiteurenApiError,
} from "@/lib/debiteuren";
import { buildTaxatieInvoicePayload } from "@/lib/debiteurenInvoicePayload";
import { prisma } from "@/lib/prisma";

function moneyToCents(value: number) {
  return Math.round(value * 100);
}

function dateFromDebiteuren(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
}

function serializePlatformInvoice(invoice: Awaited<ReturnType<typeof recordProjectDebiteurenInvoice>> | null) {
  if (!invoice) return null;
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
    hash: invoice.hash,
    idempotencyKey: invoice.idempotencyKey,
    createdBy: invoice.createdBy,
    createdAt: invoice.createdAt.toISOString(),
    invoiceUrl: getDebiteurenSharedLoginPath(`/?page=facturen&action=bekijk&id=${invoice.debiteurenFactuurId}`),
  };
}

async function recordProjectDebiteurenInvoice({
  projectId,
  idempotencyKey,
  invoiceType,
  createdBy,
  invoice,
}: {
  projectId: string;
  idempotencyKey: string;
  invoiceType: string;
  createdBy: string;
  invoice: {
    id: number;
    invoiceNumber: number;
    customerId: number;
    subject: string;
    invoiceDate: string | null;
    dueDate: string | null;
    amountExcl: number;
    amountIncl: number;
    hash: string | null;
  };
}) {
  return prisma.projectDebiteurenInvoice.upsert({
    where: { idempotencyKey },
    create: {
      projectId,
      debiteurenKlantId: invoice.customerId,
      debiteurenFactuurId: invoice.id,
      factuurnummer: invoice.invoiceNumber,
      invoiceType,
      subject: invoice.subject,
      invoiceDate: dateFromDebiteuren(invoice.invoiceDate),
      dueDate: dateFromDebiteuren(invoice.dueDate),
      amountExclCents: moneyToCents(invoice.amountExcl),
      amountInclCents: moneyToCents(invoice.amountIncl),
      hash: invoice.hash,
      idempotencyKey,
      createdBy,
    },
    update: {
      debiteurenKlantId: invoice.customerId,
      debiteurenFactuurId: invoice.id,
      factuurnummer: invoice.invoiceNumber,
      invoiceType,
      subject: invoice.subject,
      invoiceDate: dateFromDebiteuren(invoice.invoiceDate),
      dueDate: dateFromDebiteuren(invoice.dueDate),
      amountExclCents: moneyToCents(invoice.amountExcl),
      amountInclCents: moneyToCents(invoice.amountIncl),
      hash: invoice.hash,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const session = await auth();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (!body || typeof body !== "object" || Array.isArray(body) || body.confirmation !== "FACTUUR") {
    return NextResponse.json({ error: "Typ FACTUUR om de factuur definitief aan te maken" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      name: true,
      woningAdres: true,
      woningPostcode: true,
      woningPlaats: true,
      mauticContactId: true,
      contacts: {
        select: { mauticContactId: true, role: true, addedAt: true },
        orderBy: { addedAt: "asc" },
      },
      debiteurenLink: {
        select: { debiteurenKlantId: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const build = buildTaxatieInvoicePayload(project, body);
  if (!build.ok) {
    return NextResponse.json({ error: build.error }, { status: build.status });
  }

  try {
    const actor = session?.user?.email || session?.user?.name || "devree-platform";
    const existingPlatformInvoice = await prisma.projectDebiteurenInvoice.findUnique({
      where: { idempotencyKey: build.idempotencyKey },
    });

    if (existingPlatformInvoice) {
      return NextResponse.json({
        success: true,
        payload: build.payload,
        result: "existing",
        invoice: null,
        platformInvoice: serializePlatformInvoice(existingPlatformInvoice),
        invoiceUrl: getDebiteurenSharedLoginPath(`/?page=facturen&action=bekijk&id=${existingPlatformInvoice.debiteurenFactuurId}`),
        message: "Deze taxatiefactuur is al via het platform aangemaakt",
      });
    }

    const created = await createDebiteurenInvoice(build.payload, actor, build.idempotencyKey);
    const invoice = created.invoice && "id" in created.invoice ? created.invoice : null;
    const platformInvoice = invoice
      ? await recordProjectDebiteurenInvoice({
          projectId: id,
          idempotencyKey: build.idempotencyKey,
          invoiceType: build.payload.invoiceType,
          createdBy: actor,
          invoice,
        })
      : null;

    return NextResponse.json({
      success: true,
      payload: build.payload,
      result: created.result,
      invoice,
      platformInvoice: serializePlatformInvoice(platformInvoice),
      invoiceUrl: invoice?.id
        ? getDebiteurenSharedLoginPath(`/?page=facturen&action=bekijk&id=${invoice.id}`)
        : null,
    });
  } catch (error) {
    const status = isDebiteurenApiError(error) ? error.status : 502;
    const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
    return NextResponse.json({ error: message, payload: build.payload }, { status });
  }
}
