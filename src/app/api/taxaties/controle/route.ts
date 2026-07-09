import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { TAXATIE_CHECKLIST_ITEMS } from "@/lib/taxatieMail";

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

  return NextResponse.json({
    checklist: TAXATIE_CHECKLIST_ITEMS,
    archives,
    tasks,
  });
}
