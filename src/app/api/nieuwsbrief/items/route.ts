import { NextRequest, NextResponse } from "next/server";
import { NewsletterItemStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
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

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim();
  const status = params.get("status")?.trim();
  const limit = Math.min(parseInt(params.get("limit") || "80"), 200);
  const statusFilter = Object.values(NewsletterItemStatus).includes(status as NewsletterItemStatus)
    ? (status as NewsletterItemStatus)
    : null;

  const where: Prisma.NewsletterItemWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { category: { contains: search } },
            { audience: { contains: search } },
            { url: { contains: search } },
          ],
        }
      : {}),
  };

  const items = await prisma.newsletterItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const session = await auth();
  const data = await request.json();
  const title = cleanString(data.title);
  const url = cleanString(data.url);

  if (!title) {
    return NextResponse.json({ error: "Titel is verplicht" }, { status: 400 });
  }

  const item = await prisma.newsletterItem.create({
    data: {
      title,
      url,
      description: cleanString(data.description),
      category: cleanString(data.category),
      audience: cleanString(data.audience),
      sourceHost: urlHost(url),
      createdBy: session?.user?.email || null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
