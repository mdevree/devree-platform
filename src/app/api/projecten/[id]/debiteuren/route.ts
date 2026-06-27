import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import {
  getDebiteurenFactuurSamenvatting,
  getDebiteurenPublicUrl,
  isDebiteurenApiError,
} from "@/lib/debiteuren";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const link = await prisma.projectDebiteurenLink.findUnique({
    where: { projectId: id },
  });

  if (!link) {
    return NextResponse.json({ link: null, summary: null });
  }

  try {
    const summary = await getDebiteurenFactuurSamenvatting(link.debiteurenKlantId);
    const updatedLink = await prisma.projectDebiteurenLink.update({
      where: { projectId: id },
      data: {
        klantNaam: summary.klant.naam,
        klantEmail: summary.klant.email,
        klantAdres: [summary.klant.adres, summary.klant.postcode, summary.klant.plaats].filter(Boolean).join(", ") || null,
        lastCheckedAt: new Date(),
      },
    });

    return NextResponse.json({
      link: updatedLink,
      summary,
      debiteurenUrl: getDebiteurenPublicUrl(`/?page=klanten&action=bewerk&id=${link.debiteurenKlantId}`),
    });
  } catch (error) {
    const status = isDebiteurenApiError(error) ? error.status : 502;
    const message = error instanceof Error ? error.message : "Debiteuren niet bereikbaar";
    return NextResponse.json({ link, summary: null, error: message }, { status });
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
  const debiteurenKlantId = Number(body.debiteurenKlantId);

  if (!Number.isInteger(debiteurenKlantId) || debiteurenKlantId <= 0) {
    return NextResponse.json({ error: "Ongeldige debiteuren klant-id" }, { status: 400 });
  }

  try {
    const summary = await getDebiteurenFactuurSamenvatting(debiteurenKlantId);
    const link = await prisma.projectDebiteurenLink.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        debiteurenKlantId,
        klantNaam: summary.klant.naam,
        klantEmail: summary.klant.email,
        klantAdres: [summary.klant.adres, summary.klant.postcode, summary.klant.plaats].filter(Boolean).join(", ") || null,
        linkedBy: session?.user?.email || session?.user?.name || null,
        lastCheckedAt: new Date(),
      },
      update: {
        debiteurenKlantId,
        klantNaam: summary.klant.naam,
        klantEmail: summary.klant.email,
        klantAdres: [summary.klant.adres, summary.klant.postcode, summary.klant.plaats].filter(Boolean).join(", ") || null,
        linkedBy: session?.user?.email || session?.user?.name || null,
        linkedAt: new Date(),
        lastCheckedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      link,
      summary,
      debiteurenUrl: getDebiteurenPublicUrl(`/?page=klanten&action=bewerk&id=${debiteurenKlantId}`),
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
