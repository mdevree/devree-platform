import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_STATUSES = new Set(["open", "in_behandeling", "opgelost", "afgewezen"]);
const ALLOWED_PRIORITIES = new Set(["laag", "normaal", "hoog", "urgent"]);

function cleanOptionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();
  const update: {
    status?: string;
    priority?: string;
    internalNotes?: string | null;
    resolvedAt?: Date | null;
  } = {};

  if (typeof data.status === "string" && ALLOWED_STATUSES.has(data.status)) {
    update.status = data.status;
    update.resolvedAt = data.status === "opgelost" ? new Date() : null;
  }

  if (typeof data.priority === "string" && ALLOWED_PRIORITIES.has(data.priority)) {
    update.priority = data.priority;
  }

  const internalNotes = cleanOptionalText(data.internalNotes, 5000);
  if (internalNotes !== undefined) {
    update.internalNotes = internalNotes;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Geen geldige wijziging meegegeven" }, { status: 400 });
  }

  const feedback = await prisma.platformFeedback.update({
    where: { id },
    data: update,
  });

  return NextResponse.json({ success: true, feedback });
}
