import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { searchContactByRealworksCode } from "@/lib/mautic";
import {
  isOtdTriggerFromRealworks,
  normalizeRealworksBrokerObjectForOtd,
  otdCompletenessIssues,
  projectUpdateDataFromOtd,
  soldPropertyImport,
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
  const realworksSystemId = stringValue(otd.realworksSystemId);
  const realworksProjectSystemId = stringValue(otd.realworksProjectSystemId);
  const objectCode = stringValue(otd.realworksObjectCode);
  const address = stringValue(updateData.woningAdres);

  if (!realworksSystemId && !objectCode && !address) {
    return NextResponse.json(
      { error: "Geen betrouwbare object-sleutel gevonden" },
      { status: 400 },
    );
  }

  const sale = soldPropertyImport(otd, fields.lissttrans);
  const objectKeys: Prisma.ProjectWhereInput[] = [
    ...(realworksSystemId ? [{ realworksSystemId }, { realworksId: realworksSystemId }] : []),
    ...(objectCode ? [{ realworksId: objectCode }] : []),
  ];
  const cleanedUpdateData = Object.fromEntries(
    Object.entries(updateData).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  );

  async function saveProject(tx: Prisma.TransactionClient) {
    // Eén adres kan meerdere verkoopopdrachten hebben. Rond alleen het
    // dossier met dezelfde Realworks-objectidentiteit af.
    let existing = objectKeys.length ? await tx.project.findFirst({
      where: { type: "VERKOOP", OR: objectKeys }, orderBy: { updatedAt: "desc" },
    }) : null;

    if (!existing && sale === "regular") {
      existing = await tx.project.findFirst({
        where: {
          type: "VERKOOP",
          OR: [
            ...(realworksProjectSystemId ? [{ realworksProjectSystemId }] : []),
            ...(address ? [{ woningAdres: address }] : []),
          ],
          // Een volgende opdracht op hetzelfde adres krijgt een eigen dossier.
          AND: [{ OR: [{ projectStatus: null }, { projectStatus: { notIn: ["AFGEROND", "GEANNULEERD"] } }] }],
        },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (!existing && (sale === "sold" || (sale === "completed" && !objectKeys.length))) return null;

    const completed = sale === "completed" && existing?.projectStatus !== "GEANNULEERD" && existing?.status !== "geannuleerd" && !existing?.cancelledAt;
    const statusFields = completed ? { projectStatus: "AFGEROND" as const, status: "afgerond" } : {};
    if (existing) {
      const project = await tx.project.update({
        where: { id: existing.id },
        data: { ...cleanedUpdateData, projectStatus: undefined, status: undefined, ...statusFields },
      });
      return { project, created: false };
    }
    const project = await tx.project.create({ data: { ...updateData, ...statusFields } });
    return { project, created: true };
  }

  // Gelijktijdige saves van hetzelfde Realworks-object mogen niet beide een
  // nieuw dossier maken. Herlees na een deadlock binnen een nieuwe transactie.
  const persist = () => prisma.$transaction(saveProject, { isolationLevel: "Serializable" });
  const result = await persist().catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return persist();
    throw error;
  });
  if (!result) {
    return NextResponse.json({
      success: true, created: false, ignored: true, project: null,
      ignoredReason: !objectKeys.length ? "Verkocht object zonder Realworks-objectsleutel" : "Verkocht zonder verstreken transportdatum",
    });
  }
  const { project, created } = result;

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
    created,
    otdReadyTrigger,
    project,
    linkedMauticContact,
    otd,
    issues: otdCompletenessIssues(otd),
  }, { status: created ? 201 : 200 });
}
