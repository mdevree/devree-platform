import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanType(value: unknown): "HERO" | "TEXT" | "LINK_LIST" | "CTA" {
  return value === "HERO" || value === "LINK_LIST" || value === "CTA" ? value : "TEXT";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();
  const existingBlocks = await prisma.newsletterBlock.count({ where: { issueId: id } });
  const itemId = cleanString(data.itemId);
  const item = itemId ? await prisma.newsletterItem.findUnique({ where: { id: itemId } }) : null;

  const block = await prisma.newsletterBlock.create({
    data: {
      issueId: id,
      itemId: item?.id || null,
      type: cleanType(data.type),
      position: Number.isInteger(data.position) ? data.position : existingBlocks,
      title: cleanString(data.title) || item?.title || null,
      body: cleanString(data.body) || item?.description || null,
      url: cleanString(data.url) || item?.url || null,
      ctaLabel: cleanString(data.ctaLabel),
    },
    include: { item: true },
  });

  if (item) {
    await prisma.newsletterItem.update({
      where: { id: item.id },
      data: { status: "GEPLAND" },
    });
  }

  return NextResponse.json({ block }, { status: 201 });
}
