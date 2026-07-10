import { NextRequest, NextResponse } from "next/server";
import { Verkoopstart } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";

const VERKOOPSTART_VALUES = new Set<Verkoopstart>(["DIRECT", "UITGESTELD", "SLAPEND"]);
const ENERGIELABEL_CHOICES = new Set(["AANWEZIG_OF_ZELF", "VIA_MAKELAAR"]);
const QUICKSCAN_CHOICES = new Set(["ZELF_REGELEN", "VIA_MAKELAAR"]);

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseVerkoopstart(value: unknown): Verkoopstart {
  const verkoopstart = (cleanString(value) || "DIRECT") as Verkoopstart;
  if (!VERKOOPSTART_VALUES.has(verkoopstart)) {
    throw new Error("Ongeldige verkoopstart");
  }
  return verkoopstart;
}

async function notifyOfficeProposalRemarks({
  project,
  body,
  remarks,
  isAankoop = false,
}: {
  project: {
    id: string;
    name: string;
    woningAdres: string | null;
    woningPostcode: string | null;
    woningPlaats: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  body: Record<string, unknown>;
  remarks: string | null;
  isAankoop?: boolean;
}) {
  const webhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return;

  const platformUrl = (process.env.PLATFORM_BASE_URL || "https://kantoor.devreemakelaardij.nl").replace(/\/$/, "");
  const objectAdres = [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ") || project.name;
  const html = `
    <h2>Vraag of opmerking bij voorstel</h2>
    <p>Een opdrachtgever heeft een vraag of opmerking verstuurd via de voorstelpagina.</p>
    <p>
      <strong>Project:</strong> ${escapeHtml(project.name)}<br>
      <strong>Object:</strong> ${escapeHtml(objectAdres)}<br>
      <strong>Contact:</strong> ${escapeHtml(project.contactName || "Onbekend")}<br>
      <strong>E-mail:</strong> ${escapeHtml(project.contactEmail || "")}<br>
      <strong>Telefoon:</strong> ${escapeHtml(project.contactPhone || "")}
    </p>
    ${remarks ? `<h3>Opmerking klant</h3><p>${escapeHtml(remarks).replace(/\n/g, "<br>")}</p>` : ""}
    <h3>Back-up alle ingestuurde velden</h3>
    <pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>
    <p><a href="${escapeHtml(`${platformUrl}/projecten/${project.id}`)}">Open project in kantoorplatform</a></p>
  `;

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      to: "info@devreemakelaardij.nl",
      subject: isAankoop ? `Vraag/opmerking voorstel aankoop: ${objectAdres}` : `Vraag/opmerking voorstel: ${objectAdres}`,
      html,
    }),
  }).catch((error) => {
    console.error("Voorstel opmerking mail mislukt:", error);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));

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

  // Aankoopvoorstellen kennen geen verkoopstart- of kostenkeuzes en de status
  // blijft OTD_VERSTUURD (gezet bij het aanmaken van de voorstellink).
  if (proposal.project.type === "AANKOOP") {
    const remarks = cleanString(body.remarks);

    await prisma.projectProposal.update({
      where: { id: proposal.id },
      data: { selectedRemarks: remarks },
    });

    await notifyOfficeProposalRemarks({
      project: proposal.project,
      body,
      remarks,
      isAankoop: true,
    });

    return NextResponse.json({ success: true });
  }

  let verkoopstart: Verkoopstart;
  try {
    verkoopstart = parseVerkoopstart(body.verkoopstart);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ongeldige keuze" },
      { status: 400 },
    );
  }

  const startdatum = verkoopstart === "DIRECT" || !body.startdatum ? null : new Date(body.startdatum);
  const silentSale = body.silentSale === true || verkoopstart === "SLAPEND";
  const startReden = verkoopstart === "DIRECT" ? null : cleanString(body.startReden);
  const remarks = cleanString(body.remarks);
  const energielabelChoice = ENERGIELABEL_CHOICES.has(cleanString(body.energielabelChoice) || "")
    ? cleanString(body.energielabelChoice)
    : "AANWEZIG_OF_ZELF";
  const energielabelNote = cleanString(body.energielabelNote);
  const quickscanChoice = QUICKSCAN_CHOICES.has(cleanString(body.quickscanChoice) || "")
    ? cleanString(body.quickscanChoice)
    : "ZELF_REGELEN";
  const quickscanNote = cleanString(body.quickscanNote);

  await prisma.projectProposal.update({
    where: { id: proposal.id },
    data: {
      selectedVerkoopstart: verkoopstart,
      selectedStartdatum: startdatum,
      selectedStartReden: startReden,
      selectedSilentSale: silentSale,
      selectedRemarks: remarks,
      selectedEnergielabelChoice: energielabelChoice,
      selectedEnergielabelNote: energielabelNote,
      selectedQuickscanChoice: quickscanChoice,
      selectedQuickscanNote: quickscanNote,
    },
  });

  await prisma.project.update({
    where: { id: proposal.projectId },
    data: { projectStatus: "OFFERTE_VERSTUURD" },
  });

  await notifyOfficeProposalRemarks({
    project: proposal.project,
    body,
    remarks,
  });

  return NextResponse.json({ success: true });
}
