import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { searchContactByRealworksCode, getContact } from "@/lib/mautic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak)
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });

  // Parallel: Mautic-contact + project opzoeken
  let [mauticContact, project] = await Promise.all([
    afspraak.agrcode ? searchContactByRealworksCode(afspraak.agrcode) : Promise.resolve(null),
    afspraak.agobjcode
      ? prisma.project.findFirst({
          where: { realworksId: afspraak.agobjcode },
          include: { contacts: { orderBy: { addedAt: "asc" }, take: 1 } },
        })
      : afspraak.projectId
      ? prisma.project.findUnique({
          where: { id: afspraak.projectId },
          include: { contacts: { orderBy: { addedAt: "asc" }, take: 1 } },
        })
      : Promise.resolve(null),
  ]);

  // Fallback: als agrcode geen contact oplevert, probeer het project-contact via Mautic ID
  if (!mauticContact && project && "contacts" in project && project.contacts.length > 0) {
    mauticContact = await getContact(project.contacts[0].mauticContactId);
  }

  const hasContact = mauticContact !== null;
  const hasProject = project !== null;

  let enrichmentStatus: string;
  if (hasContact && hasProject) enrichmentStatus = "ok";
  else if (!hasContact && !hasProject) enrichmentStatus = "no_contact";
  else if (!hasContact) enrichmentStatus = "no_contact";
  else enrichmentStatus = "no_project";

  const updated = await prisma.agendaAfspraak.update({
    where: { id },
    data: {
      contactNaam: mauticContact
        ? `${mauticContact.firstname} ${mauticContact.lastname}`.trim()
        : afspraak.contactNaam,
      contactEmail: mauticContact?.email ?? afspraak.contactEmail,
      contactTelefoon: mauticContact?.mobile ?? mauticContact?.phone ?? afspraak.contactTelefoon,
      mauticContactId: mauticContact?.id ?? afspraak.mauticContactId,
      projectId: project?.id ?? afspraak.projectId,
      enrichedAt: new Date(),
      enrichmentStatus,
    },
    include: {
      project: {
        select: { id: true, name: true, woningAdres: true, woningPlaats: true },
      },
    },
  });

  return NextResponse.json(updated);
}
