import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

function appendReviewNote(current: string | null, note: string) {
  return [current, note].filter(Boolean).join("\n");
}

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
  if (body.approvalText !== "BEL") {
    return NextResponse.json({ error: "Typ exact BEL om deze AI-call bewust te starten" }, { status: 400 });
  }
  if (!["ready", "approved"].includes(job.status)) {
    return NextResponse.json({ error: `Belkaart heeft status '${job.status}' en kan nog niet worden gestart` }, { status: 400 });
  }

  const reviewer = body.reviewedBy || body.startedBy || "platform";
  const starter = body.startedBy || null;
  const approvalNote = [
    body.reviewNotes || job.reviewNotes || null,
    `AI-call handmatig goedgekeurd met bevestiging BEL door ${reviewer} op ${new Date().toISOString()}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const webhookUrl = process.env.AI_CALL_START_WEBHOOK_URL;
  if (!webhookUrl) {
    const approved = await prisma.aiCallJob.update({
      where: { id },
      data: {
        status: "approved",
        reviewedBy: reviewer,
        startedBy: starter,
        reviewNotes: approvalNote,
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
      reviewedBy: reviewer,
      startedBy: starter,
      reviewNotes: approvalNote,
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
      data: { status: "failed", reviewNotes: appendReviewNote(started.reviewNotes, `Caller start mislukt: ${response.status} ${text}`) },
    });
    return NextResponse.json({ error: "Caller webhook mislukt", job: failed }, { status: 502 });
  }

  return NextResponse.json({ queued: true, job: started });
}
