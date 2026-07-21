import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { loadProjectTaxatieDossier } from "@/lib/taxatieDossierService";
import { assertSourceValuesReadyForExport, sourceValidationSummary } from "@/lib/taxatieSourceConflicts";

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  try {
    const document = await loadProjectTaxatieDossier(projectId);
    if (request.nextUrl.searchParams.get("view") === "export") {
      assertSourceValuesReadyForExport(document.dossier);
    }
    return NextResponse.json({
      dossier: document.dossier,
      dossierPath: document.path,
      etag: document.etag,
      exists: document.exists,
      validation: sourceValidationSummary(document.dossier),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dossier ophalen mislukt" }, { status: 400 });
  }
}
