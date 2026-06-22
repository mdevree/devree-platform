import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const job = await prisma.aiCallJob.update({
    where: { id },
    data: {
      ...(typeof body.status === "string" ? { status: body.status } : {}),
      ...(typeof body.contactName === "string" ? { contactName: body.contactName } : {}),
      ...(typeof body.contactPhone === "string" ? { contactPhone: body.contactPhone } : {}),
      ...(typeof body.contactEmail === "string" ? { contactEmail: body.contactEmail } : {}),
      ...(typeof body.language === "string" ? { language: body.language } : {}),
      ...(typeof body.scriptPreview === "string" ? { scriptPreview: body.scriptPreview } : {}),
      ...(typeof body.reviewNotes === "string" ? { reviewNotes: body.reviewNotes } : {}),
      ...(body.context ? { context: body.context } : {}),
    },
  });

  return NextResponse.json(job);
}
