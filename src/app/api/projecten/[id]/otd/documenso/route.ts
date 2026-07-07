import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { createDocumensoOtdConcept, type DocumensoRecipient } from "@/lib/documenso";
import { getContactFull } from "@/lib/mautic";
import { prisma } from "@/lib/prisma";

function slugPart(value: string | null | undefined): string {
  return (value || "opdracht")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "opdracht";
}

function isEmail(value: string | null | undefined): value is string {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function uniqueRecipients(recipients: DocumensoRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = `${recipient.role}:${recipient.email.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contacts: {
        where: { role: { in: ["opdrachtgever", "partner", "gemachtigde"] } },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const origin = request.nextUrl.origin;
  const pdfRes = await fetch(`${origin}/api/projecten/${project.id}/otd/pdf`, {
    headers: {
      cookie: request.headers.get("cookie") || "",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
  });

  if (!pdfRes.ok) {
    return NextResponse.json(
      { error: `OTD-PDF kon niet worden gemaakt (${pdfRes.status})` },
      { status: 502 },
    );
  }

  const contactDetails = await Promise.all(project.contacts.map(async (link) => {
    const contact = await getContactFull(link.mauticContactId).catch(() => null);
    const name = [contact?.firstname, contact?.lastname].filter(Boolean).join(" ") || link.label || `Mautic ${link.mauticContactId}`;
    return {
      name,
      email: contact?.email || null,
    };
  }));

  const opdrachtgeverRecipients = contactDetails
    .flatMap((contact, index) => isEmail(contact.email) ? [{
      name: contact.name,
      email: contact.email,
      role: "SIGNER" as const,
      signingOrder: index + 2,
    }] : []);

  const recipients = uniqueRecipients([
    {
      name: "Melvin de Vree",
      email: "melvin@devreemakelaardij.nl",
      role: "SIGNER",
      signingOrder: 1,
    },
    ...opdrachtgeverRecipients,
    {
      name: "De Vree Makelaardij",
      email: "info@devreemakelaardij.nl",
      role: "CC",
      signingOrder: opdrachtgeverRecipients.length + 2,
    },
  ]);

  const title = `Opdracht tot dienstverlening ${project.woningAdres || project.name}`;
  const filename = `Opdracht_tot_dienstverlening_${slugPart(project.woningAdres || project.name)}.pdf`;

  try {
    const concept = await createDocumensoOtdConcept({
      pdf: Buffer.from(await pdfRes.arrayBuffer()),
      filename,
      title,
      externalId: `devree-platform-project-${project.id}`,
      recipients,
    });

    return NextResponse.json({
      success: true,
      concept,
      recipients,
      missingRecipientEmails: contactDetails
        .filter((contact) => !isEmail(contact.email))
        .map((contact) => contact.name),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Documenso concept kon niet worden gemaakt" },
      { status: 502 },
    );
  }
}
