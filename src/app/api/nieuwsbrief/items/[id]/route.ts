import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function urlHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
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
  const url = data.url !== undefined ? cleanString(data.url) : undefined;

  const item = await prisma.newsletterItem.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: cleanString(data.title) || "" } : {}),
      ...(data.description !== undefined ? { description: cleanString(data.description) } : {}),
      ...(data.category !== undefined ? { category: cleanString(data.category) } : {}),
      ...(data.audience !== undefined ? { audience: cleanString(data.audience) } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(url !== undefined ? { url, sourceHost: urlHost(url) } : {}),
    },
  });

  return NextResponse.json({ item });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.newsletterItem.update({
    where: { id },
    data: { status: "GEARCHIVEERD" },
  });

  return NextResponse.json({ success: true });
}
