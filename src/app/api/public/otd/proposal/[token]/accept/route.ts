import { NextRequest, NextResponse } from "next/server";
import { Verkoopstart } from "@prisma/client";
import { createContact } from "@/lib/mautic";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";

const VERKOOPSTART_VALUES = new Set<Verkoopstart>(["DIRECT", "UITGESTELD", "SLAPEND"]);
const ENERGIELABEL_CHOICES = new Set(["AANWEZIG_OF_ZELF", "VIA_MAKELAAR"]);
const QUICKSCAN_CHOICES = new Set(["ZELF_REGELEN", "VIA_MAKELAAR"]);

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanExtraOpdrachtgevers(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        aanhef: cleanString(record.aanhef),
        initialen: cleanString(record.initialen),
        voornamen: cleanString(record.voornamen),
        achternaam: cleanString(record.achternaam),
        email: cleanString(record.email),
        telefoon: cleanString(record.telefoon),
        geboortedatum: cleanString(record.geboortedatum),
        geboorteplaats: cleanString(record.geboorteplaats),
        burgerlijkeStaat: cleanString(record.burgerlijkeStaat),
      };
    })
    .filter((item) => item.achternaam && item.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))
    .slice(0, 4);
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
  const silentSale = body.silentSale === true || verkoopstart === "SLAPEND";
  const startReden = verkoopstart === "DIRECT" ? null : cleanString(body.startReden);
  const remarks = cleanString(body.remarks);
  const energielabelChoice = ENERGIELABEL_CHOICES.has(cleanString(body.energielabelChoice) || "")
    ? cleanString(body.energielabelChoice)
    : "AANWEZIG_OF_ZELF";
  const energielabelNote = cleanString(body.energielabelNote);
  const energielabelKosten = energielabelChoice === "VIA_MAKELAAR"
    ? (proposal.project.kostenEnergielabel && proposal.project.kostenEnergielabel > 0 ? proposal.project.kostenEnergielabel : 350)
    : 0;
  const quickscanChoice = QUICKSCAN_CHOICES.has(cleanString(body.quickscanChoice) || "")
    ? cleanString(body.quickscanChoice)
    : "ZELF_REGELEN";
  const quickscanNote = cleanString(body.quickscanNote);
  const quickscanKosten = quickscanChoice === "VIA_MAKELAAR"
    ? (proposal.project.kostenBouwkundig && proposal.project.kostenBouwkundig > 0 ? proposal.project.kostenBouwkundig : 399)
    : 0;
  const extraOpdrachtgevers = cleanExtraOpdrachtgevers(body.extraOpdrachtgevers);

  await prisma.project.update({
    where: { id: proposal.projectId },
    data: {
      projectStatus: "OFFERTE_VERSTUURD",
      verkoopstart,
      startdatum,
      startReden,
      kostenEnergielabel: energielabelKosten,
      kostenBouwkundig: quickscanKosten,
    },
  });

  for (const extra of extraOpdrachtgevers) {
    const contact = await createContact({
      firstname: extra.voornamen?.split(/\s+/)[0] || extra.initialen || extra.aanhef || "",
      lastname: extra.achternaam || "",
      email: extra.email || undefined,
      mobile: extra.telefoon || undefined,
      address1: proposal.project.woningAdres || proposal.project.address || undefined,
      zipcode: proposal.project.woningPostcode || undefined,
      city: proposal.project.woningPlaats || undefined,
      otd_aanhef: extra.aanhef || undefined,
      otd_initialen: extra.initialen || undefined,
      otd_voornamen: extra.voornamen || undefined,
      otd_geboorteplaats: extra.geboorteplaats || undefined,
      otd_burgerlijke_staat: extra.burgerlijkeStaat || undefined,
      geboortedatum: extra.geboortedatum || undefined,
    });

    if (contact?.id) {
      await prisma.projectContact.upsert({
        where: {
          projectId_mauticContactId: {
            projectId: proposal.projectId,
            mauticContactId: contact.id,
          },
        },
        update: {
          role: "opdrachtgever",
          label: [extra.voornamen, extra.achternaam].filter(Boolean).join(" ") || extra.achternaam,
        },
        create: {
          projectId: proposal.projectId,
          mauticContactId: contact.id,
          role: "opdrachtgever",
          label: [extra.voornamen, extra.achternaam].filter(Boolean).join(" ") || extra.achternaam,
          addedBy: "voorstel",
        },
      });
    }
  }

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

    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: {
        status: "ACCEPTED",
        selectedVerkoopstart: verkoopstart,
        selectedStartdatum: startdatum,
        selectedStartReden: startReden,
        selectedSilentSale: silentSale,
        selectedRemarks: remarks,
        selectedEnergielabelChoice: energielabelChoice,
        selectedEnergielabelNote: energielabelNote,
        selectedQuickscanChoice: quickscanChoice,
        selectedQuickscanNote: quickscanNote,
        acceptedAt: new Date(),
        documensoDocumentId: conceptData.concept.documentId,
        documensoEnvelopeId: conceptData.concept.envelopeId,
        documensoSigningUrl: null,
      },
    });

    await prisma.project.update({
      where: { id: proposal.projectId },
      data: { projectStatus: "OTD_VERSTUURD" },
    });

    return NextResponse.json({
      success: true,
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
