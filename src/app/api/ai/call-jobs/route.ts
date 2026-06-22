import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { createAiCallJobFromAgenda } from "@/lib/aiBelassistent";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const jobs = await prisma.aiCallJob.findMany({
    where: status && status !== "alle" ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json();
  try {
    if (body.agendaAfspraakId) {
      const existing = await prisma.aiCallJob.findFirst({
        where: { agendaAfspraakId: String(body.agendaAfspraakId), status: { not: "cancelled" } },
        orderBy: { createdAt: "desc" },
      });
      if (existing && !body.forceNew) return NextResponse.json(existing);
      const job = await createAiCallJobFromAgenda(String(body.agendaAfspraakId));
      return NextResponse.json(job, { status: 201 });
    }

    const job = await prisma.aiCallJob.create({
      data: {
        source: body.source || "manual",
        contactName: body.contactName || null,
        contactPhone: body.contactPhone || null,
        contactEmail: body.contactEmail || null,
        language: body.language || "nl",
        propertyTitle: body.propertyTitle || null,
        propertyAddress: body.propertyAddress || null,
        propertyUrl: body.propertyUrl || null,
        context: body.context || null,
        scriptPreview: body.scriptPreview || null,
        status: body.contactPhone ? "ready" : "draft",
      },
    });
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Belkaart aanmaken mislukt" },
      { status: 500 }
    );
  }
}
