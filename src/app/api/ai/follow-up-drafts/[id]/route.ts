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
  const draft = await prisma.followUpDraft.update({
    where: { id },
    data: {
      ...(typeof body.status === "string" ? { status: body.status } : {}),
      ...(typeof body.body === "string" ? { body: body.body } : {}),
      ...(typeof body.subject === "string" ? { subject: body.subject } : {}),
      ...(typeof body.recipientPhone === "string" ? { recipientPhone: body.recipientPhone } : {}),
      ...(typeof body.recipientEmail === "string" ? { recipientEmail: body.recipientEmail } : {}),
      ...(typeof body.recipientName === "string" ? { recipientName: body.recipientName } : {}),
      ...(body.links ? { links: body.links } : {}),
      ...(body.reviewedBy || body.status === "approved" || body.status === "rejected"
        ? { reviewedBy: body.reviewedBy || null, reviewedAt: new Date() }
        : {}),
    },
  });

  return NextResponse.json(draft);
}
