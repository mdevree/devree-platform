import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getContactFull } from "@/lib/mautic";
import { aankoopTarievenFromProject } from "@/lib/otdAankoop";
import { renderPdf, slugPart } from "./shared";
import { buildVerkoopHtml } from "./verkoopHtml";
import { buildAankoopHtml } from "./aankoopHtml";

export async function GET(
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

  const contactDetails = await Promise.all(
    project.contacts.map(async (link) => {
      const contact = await getContactFull(link.mauticContactId).catch(() => null);
      const name = [contact?.firstname, contact?.lastname].filter(Boolean).join(" ") || link.label || `Mautic ${link.mauticContactId}`;
      return {
        naam: name,
        achternaam: contact?.lastname ?? null,
        aanhef: contact?.otdAanhef ?? null,
        initialen: contact?.otdInitialen ?? null,
        voornamen: contact?.otdVoornamen ?? null,
        geboortedatum: contact?.geboortedatum ?? null,
        geboorteplaats: contact?.otdGeboorteplaats ?? null,
        email: contact?.email ?? null,
        telefoon: contact?.mobile || contact?.phone || null,
        adres: contact?.address1 ?? null,
        woonplaats: contact?.city ?? null,
        postcode: contact?.zipcode ?? null,
        postcodePlaats: [contact?.zipcode, contact?.city].filter(Boolean).join(" ") || null,
        burgerlijkeStaat: contact?.otdBurgerlijkeStaat ?? null,
        rol: link.role,
      };
    }),
  );

  const opdrachtgevers = contactDetails.length
    ? contactDetails
    : [{
        naam: project.contactName || "________",
        email: project.contactEmail,
        telefoon: project.contactPhone,
        adres: null,
        postcodePlaats: null,
        rol: "opdrachtgever",
      }];

  const isAankoop = project.type === "AANKOOP";
  const html = isAankoop
    ? buildAankoopHtml({ project, opdrachtgevers, tarieven: aankoopTarievenFromProject(project) })
    : buildVerkoopHtml({ project, opdrachtgevers });
  const pdf = await renderPdf(html);
  const filename = isAankoop
    ? `Opdracht_tot_dienstverlening_aankoop_${slugPart(project.name)}.pdf`
    : `Opdracht_tot_dienstverlening_${slugPart(project.woningAdres || project.name)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
