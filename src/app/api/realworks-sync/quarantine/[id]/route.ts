import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const status = String(body.status || "");

  if (!["open", "ignored", "resolved", "replayed"].includes(status)) {
    return NextResponse.json({ error: "status moet open, ignored, resolved of replayed zijn" }, { status: 400 });
  }

  const item = await prisma.realworksSyncQuarantine.update({
    where: { id },
    data: {
      status,
      resolutionNote: body.resolutionNote ? String(body.resolutionNote) : null,
      resolvedAt: status === "open" ? null : new Date(),
    },
  });

  return NextResponse.json({ success: true, item });
}
