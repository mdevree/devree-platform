import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.opportunityId === "string" ? body.opportunityId : "";
  const draftText = typeof body.draftText === "string" ? body.draftText.trim() : "";
  const draftChannel = body.channel === "whatsapp" ? "whatsapp" : "email";

  if (!id || !draftText) {
    return NextResponse.json(
      { error: "opportunityId en draftText zijn verplicht" },
      { status: 400 }
    );
  }

  const updated = await prisma.actionOpportunity.update({
    where: { id },
    data: {
      draftStatus: "ready",
      draftChannel,
      draftText,
      draftCompletedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, opportunity: updated });
}
