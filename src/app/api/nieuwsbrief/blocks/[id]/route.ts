import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanType(value: unknown): "HERO" | "TEXT" | "LINK_LIST" | "CTA" | undefined {
  if (value === "HERO" || value === "TEXT" || value === "LINK_LIST" || value === "CTA") return value;
  return undefined;
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
  const type = cleanType(data.type);

  const block = await prisma.newsletterBlock.update({
    where: { id },
    data: {
      ...(type ? { type } : {}),
      ...(data.position !== undefined ? { position: Number(data.position) || 0 } : {}),
      ...(data.title !== undefined ? { title: cleanString(data.title) } : {}),
      ...(data.body !== undefined ? { body: cleanString(data.body) } : {}),
      ...(data.url !== undefined ? { url: cleanString(data.url) } : {}),
      ...(data.ctaLabel !== undefined ? { ctaLabel: cleanString(data.ctaLabel) } : {}),
    },
    include: { item: true },
  });

  return NextResponse.json({ block });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.newsletterBlock.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
