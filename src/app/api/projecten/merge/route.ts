import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/projecten/merge?sourceId=...&targetId=...
 * Preview van een merge: toont wat er verplaatst wordt
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const sourceId = request.nextUrl.searchParams.get("sourceId");
  const targetId = request.nextUrl.searchParams.get("targetId");

  if (!sourceId || !targetId) {
    return NextResponse.json(
      { error: "sourceId en targetId zijn verplicht" },
      { status: 400 }
    );
  }

  const [source, target] = await Promise.all([
    prisma.project.findUnique({
      where: { id: sourceId },
      include: {
        contacts: true,
        _count: { select: { tasks: true, calls: true } },
      },
    }),
    prisma.project.findUnique({
      where: { id: targetId },
      include: {
        contacts: true,
        _count: { select: { tasks: true, calls: true } },
      },
    }),
  ]);

  if (!source || !target) {
    return NextResponse.json(
      { error: "Project niet gevonden" },
      { status: 404 }
    );
  }

  const targetContactIds = new Set(
    target.contacts.map((c) => c.mauticContactId)
  );
  const contactsToMove = source.contacts.filter(
    (c) => !targetContactIds.has(c.mauticContactId)
  );

  const metadataFields: string[] = [];
  if (!target.description && source.description)
    metadataFields.push("description");
  if (!target.address && source.address) metadataFields.push("address");
  if (!target.realworksId && source.realworksId)
    metadataFields.push("realworksId");
  if (!target.notionPageId && source.notionPageId)
    metadataFields.push("notionPageId");
  if (!target.contactName && source.contactName)
    metadataFields.push("contactName");
  if (!target.contactPhone && source.contactPhone)
    metadataFields.push("contactPhone");
  if (!target.contactEmail && source.contactEmail)
    metadataFields.push("contactEmail");

  return NextResponse.json({
    preview: {
      source: { id: source.id, name: source.name, status: source.status },
      target: { id: target.id, name: target.name, status: target.status },
      tasksToTransfer: source._count.tasks,
      callsToTransfer: source._count.calls,
      contactsToTransfer: contactsToMove.length,
      contactsAlreadyLinked: source.contacts.length - contactsToMove.length,
      metadataFieldsToFill: metadataFields,
    },
  });
}

/**
 * POST /api/projecten/merge
 * Voeg twee projecten samen: verplaats alles van source naar target, verwijder source
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { sourceId, targetId } = await request.json();

  if (!sourceId || !targetId) {
    return NextResponse.json(
      { error: "sourceId en targetId zijn verplicht" },
      { status: 400 }
    );
  }

  if (sourceId === targetId) {
    return NextResponse.json(
      { error: "Bron en doel mogen niet hetzelfde project zijn" },
      { status: 400 }
    );
  }

  const [source, target] = await Promise.all([
    prisma.project.findUnique({
      where: { id: sourceId },
      include: {
        contacts: true,
        _count: { select: { tasks: true, calls: true } },
      },
    }),
    prisma.project.findUnique({
      where: { id: targetId },
      include: { contacts: true },
    }),
  ]);

  if (!source) {
    return NextResponse.json(
      { error: "Bronproject niet gevonden" },
      { status: 404 }
    );
  }
  if (!target) {
    return NextResponse.json(
      { error: "Doelproject niet gevonden" },
      { status: 404 }
    );
  }

  // Bepaal welke metadata-velden aangevuld moeten worden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadataUpdate: Record<string, any> = {};
  if (!target.description && source.description)
    metadataUpdate.description = source.description;
  if (!target.address && source.address)
    metadataUpdate.address = source.address;
  if (!target.realworksId && source.realworksId)
    metadataUpdate.realworksId = source.realworksId;
  if (!target.notionPageId && source.notionPageId)
    metadataUpdate.notionPageId = source.notionPageId;
  if (!target.mauticContactId && source.mauticContactId)
    metadataUpdate.mauticContactId = source.mauticContactId;
  if (!target.contactName && source.contactName)
    metadataUpdate.contactName = source.contactName;
  if (!target.contactPhone && source.contactPhone)
    metadataUpdate.contactPhone = source.contactPhone;
  if (!target.contactEmail && source.contactEmail)
    metadataUpdate.contactEmail = source.contactEmail;

  // Bepaal welke contacten verplaatst vs. verwijderd moeten worden
  const targetContactIds = new Set(
    target.contacts.map((c) => c.mauticContactId)
  );
  const contactsToMove = source.contacts.filter(
    (c) => !targetContactIds.has(c.mauticContactId)
  );
  const contactsToDelete = source.contacts.filter((c) =>
    targetContactIds.has(c.mauticContactId)
  );

  // Voer merge uit in een transactie
  await prisma.$transaction([
    // 1. Verplaats alle taken
    prisma.task.updateMany({
      where: { projectId: sourceId },
      data: { projectId: targetId },
    }),
    // 2. Verplaats alle gesprekken
    prisma.call.updateMany({
      where: { projectId: sourceId },
      data: { projectId: targetId },
    }),
    // 3. Verplaats contacten die nog niet aan target gekoppeld zijn
    ...contactsToMove.map((c) =>
      prisma.projectContact.update({
        where: { id: c.id },
        data: { projectId: targetId },
      })
    ),
    // 4. Verwijder dubbele contacten (zouden unique constraint schenden)
    ...contactsToDelete.map((c) =>
      prisma.projectContact.delete({
        where: { id: c.id },
      })
    ),
    // 5. Vul lege metadata-velden aan op target
    ...(Object.keys(metadataUpdate).length > 0
      ? [
          prisma.project.update({
            where: { id: targetId },
            data: metadataUpdate,
          }),
        ]
      : []),
    // 6. Verwijder het bronproject
    prisma.project.delete({ where: { id: sourceId } }),
  ]);

  return NextResponse.json({
    success: true,
    merged: {
      tasksTransferred: source._count.tasks,
      callsTransferred: source._count.calls,
      contactsTransferred: contactsToMove.length,
      contactsSkipped: contactsToDelete.length,
      metadataFieldsFilled: Object.keys(metadataUpdate),
    },
  });
}
