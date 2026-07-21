import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { DossierWriteConflictError, writeTaxatieDossier } from "@/lib/taxatieDossierStore";
import { loadProjectTaxatieDossier } from "@/lib/taxatieDossierService";
import {
  registerSourceObservation,
  sourceValidationSummary,
  type SourceObservationInput,
} from "@/lib/taxatieSourceConflicts";

interface ObservationRequest extends SourceObservationInput {
  field: string;
}

function safeActor(value: unknown) {
  return String(value || "document-verwerker")
    .trim()
    .replace(/[^a-zA-Z0-9@._ -]/g, "")
    .slice(0, 100) || "document-verwerker";
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      projectId?: string;
      actor?: string;
      observations?: ObservationRequest[];
    };
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
    }
    if (!Array.isArray(body.observations) || body.observations.length === 0) {
      return NextResponse.json({ error: "observations moet minimaal één bronwaarde bevatten" }, { status: 400 });
    }
    if (body.observations.length > 100) {
      return NextResponse.json({ error: "Maximaal 100 bronwaarden per request" }, { status: 400 });
    }

    const session = await auth();
    const actor = session?.user?.email || `n8n:${safeActor(body.actor)}`;
    const document = await loadProjectTaxatieDossier(body.projectId);
    let created = 0;
    const fields = [];
    for (const observation of body.observations) {
      const { field, ...input } = observation;
      if (!field) throw new Error("Elke bronwaarde moet een field bevatten");
      const result = registerSourceObservation(document.dossier, field, input, { actor });
      if (result.created) created += 1;
      fields.push({ key: result.field.key, status: result.field.status, sourceValueId: result.field.sourceValues.at(-1)?.id });
    }
    await writeTaxatieDossier(document);

    return NextResponse.json({
      success: true,
      dossierPath: document.path,
      observationsCreated: created,
      fields,
      validation: sourceValidationSummary(document.dossier),
    });
  } catch (error) {
    const status = error instanceof DossierWriteConflictError ? 409 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bronwaarden verwerken mislukt" }, { status });
  }
}
