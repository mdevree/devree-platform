import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const { id } = await params;
  const { status, error } = await request.json();

  if (!["processing", "done", "failed"].includes(status)) {
    return NextResponse.json(
      { error: "status moet processing, done of failed zijn" },
      { status: 400 }
    );
  }

  const whereClause =
    status === "processing"
      ? { id, status: "pending" }
      : { id };

  const updated = await prisma.realworksWoningTask.updateMany({
    where: whereClause,
    data: {
      status,
      error: error ?? null,
      processedAt: status === "done" || status === "failed" ? new Date() : null,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Taak kon niet worden geclaimd (al in behandeling of afgerond)" },
      { status: 409, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
}
