import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { getDebiteurenSharedLoginPath } from "@/lib/debiteuren";
import { buildDebiteurenControle } from "@/lib/debiteurenControle";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { type: "TAXATIE" },
        { mauticContactId: { not: null } },
        { contacts: { some: {} } },
        { debiteurenLink: { isNot: null } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 1000,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      projectStatus: true,
      woningAdres: true,
      woningPostcode: true,
      woningPlaats: true,
      mauticContactId: true,
      updatedAt: true,
      contacts: {
        select: { mauticContactId: true, role: true },
      },
      debiteurenLink: {
        select: {
          id: true,
          debiteurenKlantId: true,
          klantNaam: true,
          klantEmail: true,
          klantAdres: true,
          mauticContactId: true,
          contactWarnings: true,
          normalizationCheckedAt: true,
          contactWarningsReviewedAt: true,
          contactWarningsReviewedBy: true,
          contactWarningsReviewNote: true,
          linkedAt: true,
          lastCheckedAt: true,
        },
      },
      debiteurenInvoices: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          debiteurenFactuurId: true,
          factuurnummer: true,
          invoiceType: true,
          amountInclCents: true,
          status: true,
          paidAt: true,
          overdue: true,
          lastSyncedAt: true,
          syncError: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    ...buildDebiteurenControle(projects),
    debiteurenLoginUrl: getDebiteurenSharedLoginPath("/"),
    checkedAt: new Date().toISOString(),
  });
}
