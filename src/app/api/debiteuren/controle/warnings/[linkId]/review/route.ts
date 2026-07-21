import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { parseContactWarnings } from "@/lib/debiteurenControle";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { linkId } = await params;
  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  if (note.length > 500) {
    return NextResponse.json({ error: "Notitie mag maximaal 500 tekens zijn" }, { status: 400 });
  }

  const link = await prisma.projectDebiteurenLink.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      contactWarnings: true,
    },
  });

  if (!link) {
    return NextResponse.json({ error: "Debiteurenlink niet gevonden" }, { status: 404 });
  }

  if (parseContactWarnings(link.contactWarnings).length === 0) {
    return NextResponse.json({ error: "Deze debiteurenlink heeft geen adreswaarschuwingen" }, { status: 400 });
  }

  const session = await auth();
  const reviewedBy = session?.user?.email || session?.user?.name || "devree-platform";
  const updated = await prisma.projectDebiteurenLink.update({
    where: { id: linkId },
    data: {
      contactWarningsReviewedAt: new Date(),
      contactWarningsReviewedBy: reviewedBy,
      contactWarningsReviewNote: note || null,
    },
  });

  return NextResponse.json({
    success: true,
    link: updated,
  });
}
