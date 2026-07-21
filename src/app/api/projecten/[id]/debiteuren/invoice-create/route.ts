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
    const created = await createDebiteurenInvoice(build.payload, actor, build.idempotencyKey);
    const invoice = created.invoice && "id" in created.invoice ? created.invoice : null;
    return NextResponse.json({
      success: true,
      payload: build.payload,
      result: created.result,
      invoice,
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
