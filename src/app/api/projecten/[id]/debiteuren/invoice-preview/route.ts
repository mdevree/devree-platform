import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import {
  previewDebiteurenInvoice,
  isDebiteurenApiError,
  type DebiteurenInvoiceCreateV1,
} from "@/lib/debiteuren";
import { prisma } from "@/lib/prisma";

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
  const amountExcl = money(body.amountExcl);
  if (amountExcl === null) {
    return NextResponse.json({ error: "amountExcl is verplicht en moet positief zijn" }, { status: 400 });
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

  if (project.type !== "TAXATIE") {
    return NextResponse.json({ error: "Factuurpreview is nu alleen voor taxatieprojecten beschikbaar" }, { status: 400 });
  }

  if (!project.debiteurenLink) {
    return NextResponse.json({ error: "Koppel eerst een debiteurenklant aan dit project" }, { status: 400 });
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

  const payload: DebiteurenInvoiceCreateV1 = {
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
  };

  try {
    const actor = session?.user?.email || session?.user?.name || "devree-platform";
    const preview = await previewDebiteurenInvoice(payload, actor);
    return NextResponse.json({ success: true, payload, preview });
  } catch (error) {
    const status = isDebiteurenApiError(error) ? error.status : 502;
    const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
    return NextResponse.json({ error: message, payload }, { status });
  }
}
