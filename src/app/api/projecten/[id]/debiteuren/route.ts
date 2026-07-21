import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import {
  getDebiteurenFactuurSamenvatting,
  getDebiteurenSharedLoginPath,
  isDebiteurenApiError,
  upsertDebiteurenCustomerFromContact,
} from "@/lib/debiteuren";
import type { ContactV1NormalizationWarning } from "@/lib/contracts/contactV1";
import { getContactFull } from "@/lib/mautic";

function klantAdres(summary: Awaited<ReturnType<typeof getDebiteurenFactuurSamenvatting>>) {
  return [summary.klant.adres, summary.klant.postcode, summary.klant.plaats].filter(Boolean).join(", ") || null;
}

function normalizedWarningsChanged(current: unknown, next: ContactV1NormalizationWarning[] | null) {
  return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null);
}

async function getProjectDebiteurenInvoices(projectId: string) {
  const invoices = await prisma.projectDebiteurenInvoice.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return invoices.map((invoice) => ({
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
  }));
}

async function saveProjectDebiteurenLink({
  projectId,
  debiteurenKlantId,
  linkedBy,
  normalization,
}: {
  projectId: string;
  debiteurenKlantId: number;
  linkedBy: string | null;
  normalization?: {
    mauticContactId: number;
    warnings: ContactV1NormalizationWarning[];
  } | null;
}) {
  const summary = await getDebiteurenFactuurSamenvatting(debiteurenKlantId);
  const invoices = await getProjectDebiteurenInvoices(projectId);
  const contactWarnings = normalization
    ? normalization.warnings as Prisma.InputJsonValue
    : Prisma.JsonNull;
  const normalizationCheckedAt = normalization ? new Date() : null;
  const existingLink = await prisma.projectDebiteurenLink.findUnique({
    where: { projectId },
    select: { contactWarnings: true },
  });
  const shouldClearReview = !normalization || normalizedWarningsChanged(existingLink?.contactWarnings ?? null, normalization.warnings);
  const reviewData = shouldClearReview
    ? {
        contactWarningsReviewedAt: null,
        contactWarningsReviewedBy: null,
        contactWarningsReviewNote: null,
      }
    : {};
  const link = await prisma.projectDebiteurenLink.upsert({
    where: { projectId },
    create: {
      projectId,
      debiteurenKlantId,
      klantNaam: summary.klant.naam,
      klantEmail: summary.klant.email,
      klantAdres: klantAdres(summary),
      mauticContactId: normalization?.mauticContactId ?? null,
      contactWarnings,
      normalizationCheckedAt,
      contactWarningsReviewedAt: null,
      contactWarningsReviewedBy: null,
      contactWarningsReviewNote: null,
      linkedBy,
      lastCheckedAt: new Date(),
    },
    update: {
      debiteurenKlantId,
      klantNaam: summary.klant.naam,
      klantEmail: summary.klant.email,
      klantAdres: klantAdres(summary),
      mauticContactId: normalization?.mauticContactId ?? null,
      contactWarnings,
      normalizationCheckedAt,
      ...reviewData,
      linkedBy,
      linkedAt: new Date(),
      lastCheckedAt: new Date(),
    },
  });

  return {
    link,
    summary,
    invoices,
    debiteurenUrl: getDebiteurenSharedLoginPath(`/?page=klanten&action=bewerk&id=${debiteurenKlantId}`),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const invoices = await getProjectDebiteurenInvoices(id);
  const link = await prisma.projectDebiteurenLink.findUnique({
    where: { projectId: id },
  });

  if (!link) {
    return NextResponse.json({ link: null, summary: null, invoices });
  }

  try {
    const summary = await getDebiteurenFactuurSamenvatting(link.debiteurenKlantId);
    const updatedLink = await prisma.projectDebiteurenLink.update({
      where: { projectId: id },
      data: {
        klantNaam: summary.klant.naam,
        klantEmail: summary.klant.email,
        klantAdres: klantAdres(summary),
        lastCheckedAt: new Date(),
      },
    });

    return NextResponse.json({
      link: updatedLink,
      summary,
      invoices,
      debiteurenUrl: getDebiteurenSharedLoginPath(`/?page=klanten&action=bewerk&id=${link.debiteurenKlantId}`),
    });
  } catch (error) {
    const status = isDebiteurenApiError(error) ? error.status : 502;
    const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
    return NextResponse.json({ link, summary: null, invoices, error: message }, { status });
  }
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
  const body = await request.json();

  if (body?.action === "upsert-from-mautic") {
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        mauticContactId: true,
        contacts: {
          select: { mauticContactId: true, role: true, addedAt: true },
          orderBy: { addedAt: "asc" },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    }

    const requestedMauticContactId = body.mauticContactId !== undefined ? Number(body.mauticContactId) : null;
    if (requestedMauticContactId !== null && (!Number.isInteger(requestedMauticContactId) || requestedMauticContactId <= 0)) {
      return NextResponse.json({ error: "Ongeldig Mautic contact-id" }, { status: 400 });
    }

    const allowedContactIds = new Set([
      ...project.contacts.map((contact) => contact.mauticContactId),
      ...(project.mauticContactId ? [project.mauticContactId] : []),
    ]);
    if (requestedMauticContactId !== null && !allowedContactIds.has(requestedMauticContactId)) {
      return NextResponse.json({ error: "Mautic contact is niet aan dit project gekoppeld" }, { status: 400 });
    }

    const opdrachtgever = project.contacts.find((contact) => contact.role === "opdrachtgever");
    const mauticContactId = requestedMauticContactId
      ?? opdrachtgever?.mauticContactId
      ?? project.contacts[0]?.mauticContactId
      ?? project.mauticContactId
      ?? null;

    if (!mauticContactId) {
      return NextResponse.json({ error: "Geen Mautic contact gekoppeld aan dit project" }, { status: 400 });
    }

    try {
      const contact = await getContactFull(mauticContactId);
      if (!contact) {
        return NextResponse.json({ error: "Mautic contact niet gevonden" }, { status: 404 });
      }

      const linkedBy = session?.user?.email || session?.user?.name || null;
      const upsert = await upsertDebiteurenCustomerFromContact(
        contact.contactV1,
        linkedBy || "devree-platform"
      );

      if (!upsert.customer?.id) {
        return NextResponse.json({ error: "Debiteuren klant is niet aangemaakt of gekoppeld", upsert }, { status: 502 });
      }

      const result = await saveProjectDebiteurenLink({
        projectId: id,
        debiteurenKlantId: upsert.customer.id,
        linkedBy,
        normalization: {
          mauticContactId,
          warnings: contact.contactV1.normalizationWarnings,
        },
      });

      return NextResponse.json({
        success: true,
        ...result,
        upsert,
        mauticContactId,
        contactWarnings: contact.contactV1.normalizationWarnings,
      });
    } catch (error) {
      const status = isDebiteurenApiError(error) ? error.status : 502;
      const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
      return NextResponse.json({ error: message }, { status });
    }
  }

  const debiteurenKlantId = Number(body.debiteurenKlantId);

  if (!Number.isInteger(debiteurenKlantId) || debiteurenKlantId <= 0) {
    return NextResponse.json({ error: "Ongeldige debiteuren klant-id" }, { status: 400 });
  }

  try {
    const result = await saveProjectDebiteurenLink({
      projectId: id,
      debiteurenKlantId,
      linkedBy: session?.user?.email || session?.user?.name || null,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const status = isDebiteurenApiError(error) ? error.status : 502;
    const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.projectDebiteurenLink.deleteMany({
    where: { projectId: id },
  });

  return NextResponse.json({ success: true });
}
