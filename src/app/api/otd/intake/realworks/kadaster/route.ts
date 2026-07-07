import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import {
  firstCompleteKadasterRegel,
  normalizeKadasterText,
  stringValue,
  type OtdKadasterRegel,
} from "@/lib/otd";

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json();
  const realworksSystemId = stringValue(body.realworksSystemId ?? body.systemid ?? body._systemid);
  const objectCode = stringValue(body.objectCode ?? body.lisnr ?? body.objectcode);

  if (!realworksSystemId && !objectCode) {
    return NextResponse.json(
      { error: "realworksSystemId of objectCode is verplicht voor kadasterkoppeling" },
      { status: 400 },
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

  const kadaster = firstCompleteKadasterRegel(rows);
  if (!kadaster) {
    return NextResponse.json({
      success: true,
      ignored: true,
      ignoredReason: "Geen bruikbare kadasterregel gevonden",
    });
  }

  const project = await prisma.project.findFirst({
    where: {
      OR: [
        ...(realworksSystemId ? [{ realworksId: realworksSystemId }] : []),
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
    });
  }

  const updatedProject = await prisma.project.update({
    where: { id: project.id },
    data: {
      kadGemeente: kadaster.gemeente ?? project.kadGemeente,
      kadSectie: kadaster.sectie ?? project.kadSectie,
      kadNummer: kadaster.nummer ?? project.kadNummer,
      woningOppervlakte: kadaster.grootteM2 ?? project.woningOppervlakte,
    },
  });

  return NextResponse.json({
    success: true,
    project: updatedProject,
    kadaster,
    rows,
  });
}
