import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_KINDS = new Set(["probleem", "verbetering", "idee"]);
const ALLOWED_PRIORITIES = new Set(["laag", "normaal", "hoog", "urgent"]);

function asCleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const where = status && status !== "all" ? { status } : {};

  const [feedback, groupedCounts] = await Promise.all([
    prisma.platformFeedback.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.platformFeedback.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const counts = groupedCounts.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  return NextResponse.json({ feedback, counts });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();
  const message = asCleanString(data.message, 5000);
  const pageUrl = asCleanString(data.pageUrl, 2000);

  if (!message) {
    return NextResponse.json({ error: "Feedback is verplicht" }, { status: 400 });
  }

  if (!pageUrl) {
    return NextResponse.json({ error: "Pagina-URL ontbreekt" }, { status: 400 });
  }

  const kind = typeof data.kind === "string" && ALLOWED_KINDS.has(data.kind)
    ? data.kind
    : "probleem";
  const priority = typeof data.priority === "string" && ALLOWED_PRIORITIES.has(data.priority)
    ? data.priority
    : "normaal";

  const feedback = await prisma.platformFeedback.create({
    data: {
      kind,
      priority,
      title: asCleanString(data.title, 160),
      message,
      expected: asCleanString(data.expected, 3000),
      pageUrl,
      path: asCleanString(data.path, 190),
      browserInfo: data.browserInfo && typeof data.browserInfo === "object"
        ? data.browserInfo
        : undefined,
      reporterId: session.user.id,
      reporterName: session.user.name,
      reporterEmail: session.user.email,
    },
  });

  return NextResponse.json({ success: true, feedback }, { status: 201 });
}
