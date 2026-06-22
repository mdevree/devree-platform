import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { createDraftsFromCallResult, queueInfoEmailForCallResult, writeAiCallResultToMautic } from "@/lib/aiBelassistent";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const aiCallJobId = searchParams.get("aiCallJobId");
  const results = await prisma.aiCallResult.findMany({
    where: aiCallJobId ? { aiCallJobId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.aiCallJobId || !body.summary) {
    return NextResponse.json({ error: "aiCallJobId en summary zijn verplicht" }, { status: 400 });
  }

  const result = await prisma.aiCallResult.create({
    data: {
      aiCallJobId: String(body.aiCallJobId),
      pbxCallId: body.pbxCallId || null,
      provider: body.provider || null,
      contextName: body.contextName || null,
      durationSeconds: Number.isFinite(Number(body.durationSeconds)) ? Number(body.durationSeconds) : null,
      outcome: body.outcome || "answered",
      summary: String(body.summary),
      transcript: body.transcript || null,
      customerQuestions: body.customerQuestions || null,
      detectedOpportunities: body.detectedOpportunities || null,
      requestedFollowUp: body.requestedFollowUp || null,
      proposedLinks: body.proposedLinks || null,
      audioNotes: body.audioNotes || null,
      qualityScore: Number.isFinite(Number(body.qualityScore)) ? Number(body.qualityScore) : null,
    },
  });

  await prisma.aiCallJob.update({
    where: { id: result.aiCallJobId },
    data: {
      status: body.outcome === "failed" ? "failed" : "completed",
      completedAt: new Date(),
    },
  });

  const [mauticResult, drafts, infoEmail] = await Promise.allSettled([
    writeAiCallResultToMautic(result.id),
    createDraftsFromCallResult(result.id),
    queueInfoEmailForCallResult(result.id),
  ]);

  return NextResponse.json({
    result,
    mauticWritten: mauticResult.status === "fulfilled" && Boolean(mauticResult.value),
    draftsCreated: drafts.status === "fulfilled" ? drafts.value.length : 0,
    infoEmailQueued: infoEmail.status === "fulfilled" && Boolean(infoEmail.value),
    warnings: [
      mauticResult.status === "rejected" ? mauticResult.reason?.message || "Mautic schrijven mislukt" : null,
      drafts.status === "rejected" ? drafts.reason?.message || "Concepten aanmaken mislukt" : null,
      infoEmail.status === "rejected" ? infoEmail.reason?.message || "Info-mail klaarzetten mislukt" : null,
    ].filter(Boolean),
  }, { status: 201 });
}
