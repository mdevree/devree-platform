import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import {
  firstCompleteKadasterRegel,
  kadasterRegelFromRealworksFields,
  normalizeKadasterText,
  stringValue,
  type OtdKadasterRegel,
} from "@/lib/otd";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await request.json();
  const realworksSystemId = stringValue(body.realworksSystemId ?? body.systemid ?? body._systemid);
  const objectCode = stringValue(body.objectCode ?? body.lisnr ?? body.objectcode ?? body.kadlisnr);

  if (!realworksSystemId && !objectCode) {
    return NextResponse.json(
      { error: "realworksSystemId of objectCode is verplicht voor kadasterkoppeling" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const rows: OtdKadasterRegel[] = Array.isArray(body.rows)
    ? body.rows.map((row: unknown) => {
        if (typeof row === "string") return normalizeKadasterText(row);
        if (row && typeof row === "object") {
          const record = row as Record<string, unknown>;
          return {
            gemeente: stringValue(record.gemeente),
            sectie: stringValue(record.sectie),
            nummer: stringValue(record.nummer),
            grootteM2: stringValue(record.grootteM2 ?? record.grootte ?? record.oppervlakte),
            eigendomssituatie: stringValue(record.eigendomssituatie),
            rawText: stringValue(record.rawText ?? record.text),
          };
        }
        return null;
      }).filter(Boolean) as OtdKadasterRegel[]
    : [];

  const fallback = normalizeKadasterText(body.rawText);
  if (fallback) rows.push(fallback);
  const directFields = kadasterRegelFromRealworksFields(body as Record<string, unknown>);
  if (directFields) rows.unshift(directFields);

  const kadaster = firstCompleteKadasterRegel(rows);
  if (!kadaster) {
    return NextResponse.json({
      success: true,
      ignored: true,
      ignoredReason: "Geen bruikbare kadasterregel gevonden",
    }, { headers: CORS_HEADERS });
  }

  const project = await prisma.project.findFirst({
    where: {
      OR: [
        ...(realworksSystemId ? [{ realworksSystemId }, { realworksId: realworksSystemId }] : []),
        ...(objectCode ? [{ realworksId: objectCode }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!project) {
    return NextResponse.json({
      success: true,
      ignored: true,
      ignoredReason: "Geen project gevonden voor Realworks object",
      kadaster,
    }, { headers: CORS_HEADERS });
  }

  const updatedProject = await prisma.project.update({
    where: { id: project.id },
    data: {
      kadGemeente: kadaster.gemeente ?? project.kadGemeente,
      kadSectie: kadaster.sectie ?? project.kadSectie,
      kadNummer: kadaster.nummer ?? project.kadNummer,
      kadGrootte: kadaster.grootteM2 ?? project.kadGrootte,
    },
  });

  return NextResponse.json({
    success: true,
    project: updatedProject,
    kadaster,
    rows,
  }, { headers: CORS_HEADERS });
}
