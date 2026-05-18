import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * POST /api/realworks-tasks
 * n8n plaatst een schrijftaak in de wachtrij.
 *
 * Body:
 *   taskType            - "write_field"
 *   realworksRelationId - Realworks relatie ID
 *   fieldName           - te schrijven veldnaam in Realworks
 *   fieldValue          - waarde
 */
export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();
  const { taskType, realworksRelationId, fieldName, fieldValue } = data;

  if (!taskType || !realworksRelationId || !fieldName || fieldValue === undefined) {
    return NextResponse.json(
      { error: "taskType, realworksRelationId, fieldName en fieldValue zijn verplicht" },
      { status: 400 }
    );
  }

  const task = await prisma.realworksTask.create({
    data: { taskType, realworksRelationId, fieldName, fieldValue: String(fieldValue) },
  });

  return NextResponse.json({ success: true, task }, { status: 201 });
}

/**
 * GET /api/realworks-tasks
 * De browser extensie pollt voor openstaande taken.
 * Geeft maximaal 10 pending taken terug, gesorteerd op aanmaakdatum.
 */
export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const tasks = await prisma.realworksTask.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  return NextResponse.json({ tasks });
}
