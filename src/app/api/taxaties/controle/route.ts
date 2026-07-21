import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { TAXATIE_CHECKLIST_ITEMS } from "@/lib/taxatieMail";
import { loadProjectTaxatieDossier } from "@/lib/taxatieDossierService";
import { sourceValidationSummary } from "@/lib/taxatieSourceConflicts";

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  const [archives, tasks] = await Promise.all([
    prisma.taxatieMailArchive.findMany({
      where: { projectId },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.task.findMany({
      where: {
        projectId,
        category: "taxatie",
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
    }),
  ]);

  let sourceValidation;
  try {
    const dossierDocument = await loadProjectTaxatieDossier(projectId);
    sourceValidation = {
      available: true,
      dossierPath: dossierDocument.path,
      exists: dossierDocument.exists,
      ...sourceValidationSummary(dossierDocument.dossier),
    };
  } catch (error) {
    sourceValidation = {
      available: false,
      error: error instanceof Error ? error.message : "Bronwaardecontrole ophalen mislukt",
      fields: [],
      openConflicts: [],
      unresolvedFields: [],
      exportReady: false,
    };
  }

  return NextResponse.json({
    checklist: TAXATIE_CHECKLIST_ITEMS,
    archives,
    tasks,
    sourceValidation,
  });
}
