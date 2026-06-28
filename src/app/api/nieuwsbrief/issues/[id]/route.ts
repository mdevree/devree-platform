import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { normalizeSegmentIds } from "@/lib/newsletter";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const include = {
  blocks: {
    orderBy: { position: "asc" as const },
    include: { item: true },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const issue = await prisma.newsletterIssue.findUnique({ where: { id }, include });
  if (!issue) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  return NextResponse.json({ issue });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();
  const issue = await prisma.newsletterIssue.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: cleanString(data.name) || "" } : {}),
      ...(data.subject !== undefined ? { subject: cleanString(data.subject) || "" } : {}),
      ...(data.preheader !== undefined ? { preheader: cleanString(data.preheader) } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.segmentIds !== undefined ? { segmentIds: normalizeSegmentIds(data.segmentIds) } : {}),
    },
    include,
  });

  return NextResponse.json({ issue });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.newsletterIssue.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
