import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

const include = {
  project: { select: { id: true, name: true, woningAdres: true, woningPlaats: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const trigger = await prisma.facebookTrigger.findUnique({ where: { id }, include });

  if (!trigger) {
    return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ trigger });
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (data.postId !== undefined) updateData.postId = data.postId?.trim() || null;
  if (data.keyword !== undefined) updateData.keyword = data.keyword.trim().toLowerCase();
  if (data.dmTekst !== undefined) updateData.dmTekst = data.dmTekst;
  if (data.actief !== undefined) updateData.actief = data.actief;
  if (data.projectId !== undefined) updateData.projectId = data.projectId || null;

  const trigger = await prisma.facebookTrigger.update({
    where: { id },
    data: updateData,
    include,
  });

  return NextResponse.json({ success: true, trigger });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.facebookTrigger.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
