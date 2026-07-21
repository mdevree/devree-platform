import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DossierWriteConflictError, writeTaxatieDossier } from "@/lib/taxatieDossierStore";
import { loadProjectTaxatieDossier } from "@/lib/taxatieDossierService";
import { confirmSourceValue, sourceValidationSummary, type SourceValue } from "@/lib/taxatieSourceConflicts";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Een ingelogde taxateur is verplicht voor bevestiging" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      projectId?: string;
      field?: string;
      sourceValueId?: string;
      manualValue?: SourceValue;
      note?: string;
    };
    if (!body.projectId || !body.field) {
      return NextResponse.json({ error: "projectId en field zijn verplicht" }, { status: 400 });
    }
    const hasSource = typeof body.sourceValueId === "string" && body.sourceValueId.length > 0;
    const hasManual = Object.prototype.hasOwnProperty.call(body, "manualValue") && body.manualValue !== null && body.manualValue !== "";
    if (hasSource === hasManual) {
      return NextResponse.json({ error: "Kies exact één bronwaarde of voer één handmatige waarde in" }, { status: 400 });
    }

    const document = await loadProjectTaxatieDossier(body.projectId);
    const selection = hasSource
      ? { sourceValueId: body.sourceValueId as string }
      : { manualValue: body.manualValue as SourceValue };
    const result = confirmSourceValue(document.dossier, body.field, selection, {
      actor: session.user.email,
      note: body.note?.trim().slice(0, 500) || undefined,
    });
    await writeTaxatieDossier(document);

    return NextResponse.json({
      success: true,
      dossierPath: document.path,
      field: result.field,
      propagated: result.propagated,
      validation: sourceValidationSummary(document.dossier),
    });
  } catch (error) {
    const status = error instanceof DossierWriteConflictError ? 409 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bronwaarde bevestigen mislukt" }, { status });
  }
}
