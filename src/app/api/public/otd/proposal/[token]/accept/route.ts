import { NextRequest, NextResponse } from "next/server";
import { Verkoopstart } from "@prisma/client";
import { createContact, updateContact } from "@/lib/mautic";
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

function cleanOpdrachtgeverCorrecties(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const mauticContactId = Number(record.mauticContactId);
      return {
        mauticContactId: Number.isFinite(mauticContactId) ? mauticContactId : null,
        naam: cleanString(record.naam),
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
    .filter((item) => item.mauticContactId)
    .slice(0, 8);
}

function splitName(value: string | null) {
  const parts = (value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstname: "", lastname: parts[0] || "" };
  return {
    firstname: parts.slice(0, -1).join(" "),
    lastname: parts.at(-1) || "",
  };
}

function parseVerkoopstart(value: unknown): Verkoopstart {
  const verkoopstart = (cleanString(value) || "DIRECT") as Verkoopstart;
  if (!VERKOOPSTART_VALUES.has(verkoopstart)) {
    throw new Error("Ongeldige verkoopstart");
  }
  return verkoopstart;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFields(fields: Array<[string, unknown]>) {
  return `
    <dl>
      ${fields.map(([label, value]) => `
        <dt><strong>${escapeHtml(label)}</strong></dt>
        <dd>${escapeHtml(value || "Niet ingevuld")}</dd>
      `).join("")}
    </dl>
  `;
}

function renderPeople(title: string, people: Array<Record<string, unknown>>) {
  if (!people.length) return `<h3>${escapeHtml(title)}</h3><p><em>Geen</em></p>`;

  return `
    <h3>${escapeHtml(title)}</h3>
    ${people.map((person, index) => `
      <h4>${escapeHtml(title)} ${index + 1}</h4>
      ${renderFields([
        ["Naam", person.naam || person.achternaam],
        ["Aanhef", person.aanhef],
        ["Initialen", person.initialen],
        ["Voornamen", person.voornamen],
        ["Achternaam", person.achternaam],
        ["E-mail", person.email],
        ["Telefoon", person.telefoon],
        ["Geboortedatum", person.geboortedatum],
        ["Geboorteplaats", person.geboorteplaats],
        ["Burgerlijke staat", person.burgerlijkeStaat],
      ])}
    `).join("")}
  `;
}

async function notifyOfficeProposalAccepted({
  project,
  proposalUrl,
  editUrl,
  remarks,
  verkoopstart,
  startdatum,
  startReden,
  silentSale,
  energielabelChoice,
  energielabelNote,
  quickscanChoice,
  quickscanNote,
  opdrachtgeverCorrecties,
  extraOpdrachtgevers,
  extraCount,
  correctionCount,
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
  proposalUrl: string | null;
  editUrl: string | null;
  remarks: string | null;
  verkoopstart: Verkoopstart;
  startdatum: Date | null;
  startReden: string | null;
  silentSale: boolean;
  energielabelChoice: string | null;
  energielabelNote: string | null;
  quickscanChoice: string | null;
  quickscanNote: string | null;
  opdrachtgeverCorrecties: Array<Record<string, unknown>>;
  extraOpdrachtgevers: Array<Record<string, unknown>>;
  extraCount: number;
  correctionCount: number;
}) {
  const webhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return;

  const platformUrl = (process.env.PLATFORM_BASE_URL || "https://kantoor.devreemakelaardij.nl").replace(/\/$/, "");
  const objectAdres = [project.woningAdres, project.woningPostcode, project.woningPlaats].filter(Boolean).join(", ") || project.name;
  const html = `
    <h2>Voorstel verkoopopdracht akkoord</h2>
    <p>Een opdrachtgever heeft akkoord gegeven op het voorstel.</p>
    <p>
      <strong>Project:</strong> ${escapeHtml(project.name)}<br>
      <strong>Object:</strong> ${escapeHtml(objectAdres)}<br>
      <strong>Contact:</strong> ${escapeHtml(project.contactName || "Onbekend")}<br>
      <strong>E-mail:</strong> ${escapeHtml(project.contactEmail || "")}<br>
      <strong>Telefoon:</strong> ${escapeHtml(project.contactPhone || "")}<br>
      <strong>Aangepaste bestaande opdrachtgevers:</strong> ${correctionCount}<br>
      <strong>Extra opdrachtgevers doorgegeven:</strong> ${extraCount}
    </p>
    <h3>Keuzes en opmerkingen</h3>
    ${renderFields([
      ["Startkeuze", verkoopstart],
      ["Startdatum", startdatum ? startdatum.toLocaleDateString("nl-NL") : ""],
      ["Toelichting start", startReden],
      ["Stille verkoop", silentSale ? "Ja" : "Nee"],
      ["Energielabel", energielabelChoice],
      ["Toelichting energielabel", energielabelNote],
      ["Quickscan", quickscanChoice],
      ["Toelichting quickscan", quickscanNote],
      ["Opmerking klant", remarks],
    ])}
    ${renderPeople("Aangepaste bestaande opdrachtgever", opdrachtgeverCorrecties)}
    ${renderPeople("Extra opdrachtgever", extraOpdrachtgevers)}
    <p>
      <a href="${escapeHtml(`${platformUrl}/projecten/${project.id}`)}">Open project in kantoorplatform</a>
      ${editUrl ? `<br><a href="${escapeHtml(editUrl)}">Open Documenso concept</a>` : ""}
      ${proposalUrl ? `<br><a href="${escapeHtml(proposalUrl)}">Open voorstelpagina</a>` : ""}
    </p>
  `;

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      to: "info@devreemakelaardij.nl",
      subject: `Voorstel akkoord: ${objectAdres}`,
      html,
    }),
  }).catch((error) => {
    console.error("Voorstel akkoord mail mislukt:", error);
  });
}

async function notifyOfficeAankoopProposalAccepted({
  project,
  proposalUrl,
  editUrl,
  remarks,
  opdrachtgeverCorrecties,
  extraOpdrachtgevers,
  body,
}: {
  project: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  proposalUrl: string | null;
  editUrl: string | null;
  remarks: string | null;
  opdrachtgeverCorrecties: Array<Record<string, unknown>>;
  extraOpdrachtgevers: Array<Record<string, unknown>>;
  body: unknown;
}) {
  const webhookUrl = process.env.AI_INFO_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return;

  const platformUrl = (process.env.PLATFORM_BASE_URL || "https://kantoor.devreemakelaardij.nl").replace(/\/$/, "");
  const html = `
    <h2>Voorstel aankoopopdracht akkoord</h2>
    <p>Een opdrachtgever heeft akkoord gegeven op het aankoopvoorstel.</p>
    <p>
      <strong>Project:</strong> ${escapeHtml(project.name)}<br>
      <strong>Contact:</strong> ${escapeHtml(project.contactName || "Onbekend")}<br>
      <strong>E-mail:</strong> ${escapeHtml(project.contactEmail || "")}<br>
      <strong>Telefoon:</strong> ${escapeHtml(project.contactPhone || "")}<br>
      <strong>Aangepaste bestaande opdrachtgevers:</strong> ${opdrachtgeverCorrecties.length}<br>
      <strong>Extra opdrachtgevers doorgegeven:</strong> ${extraOpdrachtgevers.length}
    </p>
    ${renderFields([["Opmerking klant", remarks]])}
    ${renderPeople("Aangepaste bestaande opdrachtgever", opdrachtgeverCorrecties)}
    ${renderPeople("Extra opdrachtgever", extraOpdrachtgevers)}
    <h3>Volledige inzending (back-up)</h3>
    <pre>${escapeHtml(JSON.stringify(body, null, 2))}</pre>
    <p>
      <a href="${escapeHtml(`${platformUrl}/projecten/${project.id}`)}">Open project in kantoorplatform</a>
      ${editUrl ? `<br><a href="${escapeHtml(editUrl)}">Open Documenso concept</a>` : ""}
      ${proposalUrl ? `<br><a href="${escapeHtml(proposalUrl)}">Open voorstelpagina</a>` : ""}
    </p>
  `;

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({
      to: "info@devreemakelaardij.nl",
      subject: `Voorstel aankoop akkoord: ${project.name}`,
      html,
    }),
  }).catch((error) => {
    console.error("Voorstel aankoop akkoord mail mislukt:", error);
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
    include: {
      project: {
        include: {
          contacts: {
            where: { role: { in: ["opdrachtgever", "partner", "gemachtigde"] } },
            select: { mauticContactId: true },
          },
        },
      },
    },
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

  const isAankoop = proposal.project.type === "AANKOOP";

  // Verkoopkeuzes gelden alleen voor verkoopvoorstellen; het aankooppad kent
  // geen verkoopstart-, energielabel- of quickscankeuzes.
  let verkoopstart: Verkoopstart = "DIRECT";
  if (!isAankoop) {
    try {
      verkoopstart = parseVerkoopstart(body.verkoopstart);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ongeldige keuze" },
        { status: 400 },
      );
    }
  }

  const startdatum = isAankoop || verkoopstart === "DIRECT" || !body.startdatum ? null : new Date(body.startdatum);
  const silentSale = !isAankoop && (body.silentSale === true || verkoopstart === "SLAPEND");
  const startReden = isAankoop || verkoopstart === "DIRECT" ? null : cleanString(body.startReden);
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
  const allowedContactIds = new Set(proposal.project.contacts.map((contact) => contact.mauticContactId));
  const opdrachtgeverCorrecties = cleanOpdrachtgeverCorrecties(body.opdrachtgeverCorrecties)
    .filter((correctie) => correctie.mauticContactId && allowedContactIds.has(correctie.mauticContactId));

  if (!isAankoop) {
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
  }

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

  for (const correctie of opdrachtgeverCorrecties) {
    if (!correctie.mauticContactId) continue;
    const split = splitName(correctie.naam);
    await updateContact(correctie.mauticContactId, {
      firstname: correctie.voornamen?.split(/\s+/)[0] || split.firstname || null,
      lastname: correctie.achternaam || split.lastname || correctie.naam || null,
      email: correctie.email,
      mobile: correctie.telefoon,
      otd_aanhef: correctie.aanhef,
      otd_initialen: correctie.initialen,
      otd_voornamen: correctie.voornamen,
      geboortedatum: correctie.geboortedatum,
      otd_geboorteplaats: correctie.geboorteplaats,
      otd_burgerlijke_staat: correctie.burgerlijkeStaat,
    });
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
      data: isAankoop
        ? {
            status: "ACCEPTED",
            selectedRemarks: remarks,
            acceptedAt: new Date(),
            documensoDocumentId: conceptData.concept.documentId,
            documensoEnvelopeId: conceptData.concept.envelopeId,
            documensoSigningUrl: null,
          }
        : {
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

    if (isAankoop) {
      await notifyOfficeAankoopProposalAccepted({
        project: proposal.project,
        proposalUrl: proposal.publicUrl,
        editUrl: conceptData.concept.editUrl || null,
        remarks,
        opdrachtgeverCorrecties,
        extraOpdrachtgevers,
        body,
      });
    } else {
      await notifyOfficeProposalAccepted({
        project: proposal.project,
        proposalUrl: proposal.publicUrl,
        editUrl: conceptData.concept.editUrl || null,
        remarks,
        verkoopstart,
        startdatum,
        startReden,
        silentSale,
        energielabelChoice,
        energielabelNote,
        quickscanChoice,
        quickscanNote,
        opdrachtgeverCorrecties,
        extraOpdrachtgevers,
        extraCount: extraOpdrachtgevers.length,
        correctionCount: opdrachtgeverCorrecties.length,
      });
    }

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
