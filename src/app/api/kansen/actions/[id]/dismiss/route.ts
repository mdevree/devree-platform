import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const opportunity = await prisma.actionOpportunity.findUnique({ where: { id } });
  if (!opportunity) {
    return NextResponse.json({ error: "Kans niet gevonden" }, { status: 404 });
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? `${opportunity.reason}\n\nAfgewezen: ${body.reason.trim()}`
      : opportunity.reason;

  const updated = await prisma.actionOpportunity.update({
    where: { id },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
      reason,
    },
  });

  return NextResponse.json({ success: true, opportunity: updated });
}
