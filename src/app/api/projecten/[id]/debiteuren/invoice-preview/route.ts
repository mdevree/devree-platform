import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import {
  previewDebiteurenInvoice,
  isDebiteurenApiError,
} from "@/lib/debiteuren";
import { buildProjectInvoicePayload } from "@/lib/debiteurenInvoicePayload";
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

  const build = buildProjectInvoicePayload(project, body);
  if (!build.ok) {
    return NextResponse.json({ error: build.error }, { status: build.status });
  }

  try {
    const actor = session?.user?.email || session?.user?.name || "devree-platform";
    const preview = await previewDebiteurenInvoice(build.payload, actor);
    return NextResponse.json({ success: true, payload: build.payload, preview });
  } catch (error) {
    const status = isDebiteurenApiError(error) ? error.status : 502;
    const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
    return NextResponse.json({ error: message, payload: build.payload }, { status });
  }
}
