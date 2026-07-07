import { NextRequest, NextResponse } from "next/server";
import { Verkoopstart } from "@prisma/client";
import { getDocumensoSigningLinks } from "@/lib/documenso";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";

const VERKOOPSTART_VALUES = new Set<Verkoopstart>(["DIRECT", "UITGESTELD", "SLAPEND"]);

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseVerkoopstart(value: unknown): Verkoopstart {
  const verkoopstart = (cleanString(value) || "DIRECT") as Verkoopstart;
  if (!VERKOOPSTART_VALUES.has(verkoopstart)) {
    throw new Error("Ongeldige verkoopstart");
  }
  return verkoopstart;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));

  let verkoopstart: Verkoopstart;
  try {
    verkoopstart = parseVerkoopstart(body.verkoopstart);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ongeldige keuze" },
      { status: 400 },
    );
  }

  const proposal = await prisma.projectProposal.findUnique({
    where: { tokenHash: proposalTokenHash(token) },
    include: { project: true },
  });

  if (!proposal || proposal.status !== "OPEN") {
    return NextResponse.json({ error: "Voorstel is niet beschikbaar" }, { status: 404 });
  }

  if (proposal.expiresAt && proposal.expiresAt < new Date()) {
    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: { status: "REVOKED", errorMessage: "Voorstel verlopen" },
    });
    return NextResponse.json({ error: "Voorstel is verlopen" }, { status: 410 });
  }

  const startdatum = verkoopstart === "DIRECT" || !body.startdatum ? null : new Date(body.startdatum);
  const startReden = verkoopstart === "DIRECT" ? null : cleanString(body.startReden);

  await prisma.project.update({
    where: { id: proposal.projectId },
    data: {
      projectStatus: "OFFERTE_VERSTUURD",
      verkoopstart,
      startdatum,
      startReden,
    },
  });

  try {
    const baseUrl = process.env.PLATFORM_INTERNAL_URL || request.nextUrl.origin;
    const conceptRes = await fetch(`${baseUrl}/api/projecten/${proposal.projectId}/otd/documenso`, {
      method: "POST",
      headers: {
        ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
      },
    });
    const conceptData = await conceptRes.json();

    if (!conceptRes.ok || !conceptData.success) {
      throw new Error(conceptData.error || "Documenso concept kon niet worden gemaakt");
    }

    const links = await getDocumensoSigningLinks(conceptData.concept.documentId);
    const customerSigningLink = links.find((link) => !/melvin@devreemakelaardij\.nl/i.test(link.email));

    if (!customerSigningLink) {
      throw new Error("Geen klant-ondertekenlink gevonden");
    }

    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: "ACCEPTED",
        selectedVerkoopstart: verkoopstart,
        selectedStartdatum: startdatum,
        selectedStartReden: startReden,
        acceptedAt: new Date(),
        documensoDocumentId: conceptData.concept.documentId,
        documensoEnvelopeId: conceptData.concept.envelopeId,
        documensoSigningUrl: customerSigningLink.signingUrl,
      },
    });

    await prisma.project.update({
      where: { id: proposal.projectId },
      data: { projectStatus: "OTD_VERSTUURD" },
    });

    return NextResponse.json({
      success: true,
      signingUrl: customerSigningLink.signingUrl,
      documentUrl: conceptData.concept.documentUrl,
      editUrl: conceptData.concept.editUrl,
    });
  } catch (error) {
    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Onbekende fout",
      },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Akkoord kon niet worden verwerkt" },
      { status: 502 },
    );
  }
}
