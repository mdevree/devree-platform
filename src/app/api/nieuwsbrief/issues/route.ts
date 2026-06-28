import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { normalizeSegmentIds } from "@/lib/newsletter";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const issueInclude = {
  blocks: {
    orderBy: { position: "asc" as const },
    include: { item: true },
  },
};

export async function GET(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const issues = await prisma.newsletterIssue.findMany({
    include: issueInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ issues });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const session = await auth();
  const data = await request.json();
  const name = cleanString(data.name);
  const subject = cleanString(data.subject);

  if (!name || !subject) {
    return NextResponse.json({ error: "Naam en onderwerp zijn verplicht" }, { status: 400 });
  }

  const issue = await prisma.newsletterIssue.create({
    data: {
      name,
      subject,
      preheader: cleanString(data.preheader),
      segmentIds: normalizeSegmentIds(data.segmentIds),
      createdBy: session?.user?.email || null,
    },
    include: issueInclude,
  });

  return NextResponse.json({ issue }, { status: 201 });
}
