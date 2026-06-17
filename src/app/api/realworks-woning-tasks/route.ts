import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const data = await request.json();
  const { taskType, realworksWoningId, fieldName, fieldValue } = data;

  if (!taskType || !realworksWoningId || !fieldName || fieldValue === undefined) {
    return NextResponse.json(
      { error: "taskType, realworksWoningId, fieldName en fieldValue zijn verplicht" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const task = await prisma.realworksWoningTask.create({
    data: { taskType, realworksWoningId, fieldName, fieldValue: String(fieldValue) },
  });

  return NextResponse.json({ success: true, task }, { status: 201, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const tasks = await prisma.realworksWoningTask.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  return NextResponse.json({ tasks }, { headers: CORS_HEADERS });
}
