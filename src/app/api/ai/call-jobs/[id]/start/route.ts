import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const job = await prisma.aiCallJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Belkaart niet gevonden" }, { status: 404 });
  if (!job.contactPhone) return NextResponse.json({ error: "Geen telefoonnummer op belkaart" }, { status: 400 });
  if (!body.humanApproved) {
    return NextResponse.json({ error: "Menselijke goedkeuring is verplicht voordat de caller mag starten" }, { status: 400 });
  }
  if (!["ready", "approved"].includes(job.status)) {
    return NextResponse.json({ error: `Belkaart heeft status '${job.status}' en kan nog niet worden gestart` }, { status: 400 });
  }

  const webhookUrl = process.env.AI_CALL_START_WEBHOOK_URL;
  if (!webhookUrl) {
    const approved = await prisma.aiCallJob.update({
      where: { id },
      data: {
        status: "approved",
        reviewedBy: body.reviewedBy || body.startedBy || "platform",
        startedBy: body.startedBy || null,
        reviewNotes: body.reviewNotes || job.reviewNotes,
      },
    });
    return NextResponse.json({
      queued: false,
      reason: "AI_CALL_START_WEBHOOK_URL is niet ingesteld; belkaart staat klaar voor de caller.",
      job: approved,
    });
  }

  const started = await prisma.aiCallJob.update({
    where: { id },
    data: {
      status: "calling",
      startedAt: new Date(),
      reviewedBy: body.reviewedBy || body.startedBy || "platform",
      startedBy: body.startedBy || null,
      reviewNotes: body.reviewNotes || job.reviewNotes,
    },
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify({ job: started }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const failed = await prisma.aiCallJob.update({
      where: { id },
      data: { status: "failed", reviewNotes: [started.reviewNotes, `Caller start mislukt: ${response.status} ${text}`].filter(Boolean).join("\n") },
    });
    return NextResponse.json({ error: "Caller webhook mislukt", job: failed }, { status: 502 });
  }

  return NextResponse.json({ queued: true, job: started });
}
