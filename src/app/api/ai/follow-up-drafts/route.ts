import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const drafts = await prisma.followUpDraft.findMany({
    where: status && status !== "alle" ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(drafts);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.channel || !body.body) {
    return NextResponse.json({ error: "channel en body zijn verplicht" }, { status: 400 });
  }

  const draft = await prisma.followUpDraft.create({
    data: {
      channel: body.channel,
      purpose: body.purpose || "manual",
      aiCallJobId: body.aiCallJobId || null,
      aiCallResultId: body.aiCallResultId || null,
      mauticContactId: body.mauticContactId || null,
      projectId: body.projectId || null,
      recipientName: body.recipientName || null,
      recipientPhone: body.recipientPhone || null,
      recipientEmail: body.recipientEmail || null,
      subject: body.subject || null,
      body: body.body,
      links: body.links || null,
      createdBy: body.createdBy || "manual",
    },
  });

  return NextResponse.json(draft, { status: 201 });
}
