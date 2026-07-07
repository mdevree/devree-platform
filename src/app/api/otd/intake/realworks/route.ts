import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { searchContactByRealworksCode } from "@/lib/mautic";
import {
  isOtdTriggerFromRealworks,
  normalizeRealworksBrokerObjectForOtd,
  otdCompletenessIssues,
  projectUpdateDataFromOtd,
  stringValue,
} from "@/lib/otd";

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const fields = (body?.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;

  const otd = normalizeRealworksBrokerObjectForOtd(fields);
  const otdReadyTrigger = isOtdTriggerFromRealworks(fields);
  const updateData = projectUpdateDataFromOtd(otd);
  const realworksSystemId = stringValue(updateData.realworksId);
  const objectCode = stringValue(otd.realworksObjectCode);
  const address = stringValue(updateData.woningAdres);

  if (!realworksSystemId && !objectCode && !address) {
    return NextResponse.json(
      { error: "Geen betrouwbare object-sleutel gevonden" },
      { status: 400 },
    );
  }

  const existingProject = await prisma.project.findFirst({
    where: {
      OR: [
        ...(realworksSystemId ? [{ realworksId: realworksSystemId }] : []),
        ...(objectCode ? [{ realworksId: objectCode }] : []),
        ...(address ? [{ woningAdres: address }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  const cleanedUpdateData = Object.fromEntries(
    Object.entries(updateData).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );

  const project = existingProject
    ? await prisma.project.update({
        where: { id: existingProject.id },
        data: {
          ...cleanedUpdateData,
          // Bestaande workflowstatus niet ongemerkt terugzetten vanuit een Realworks-save.
          projectStatus: undefined,
          status: undefined,
        },
      })
    : await prisma.project.create({
        data: updateData,
      });

  let linkedMauticContact = null;
  if (otd.realworksRelationCode) {
    linkedMauticContact = await searchContactByRealworksCode(otd.realworksRelationCode).catch(() => null);
    if (linkedMauticContact) {
      await prisma.projectContact.upsert({
        where: {
          projectId_mauticContactId: {
            projectId: project.id,
            mauticContactId: linkedMauticContact.id,
          },
        },
        update: {
          role: "opdrachtgever",
          label: otd.realworksRelationName ?? null,
        },
        create: {
          projectId: project.id,
          mauticContactId: linkedMauticContact.id,
          role: "opdrachtgever",
          label: otd.realworksRelationName ?? null,
          addedBy: "realworks-browserext",
        },
      });
    }
  }

  return NextResponse.json({
    success: true,
    created: !existingProject,
    otdReadyTrigger,
    project,
    linkedMauticContact,
    otd,
    issues: otdCompletenessIssues(otd),
  }, { status: existingProject ? 200 : 201 });
}
