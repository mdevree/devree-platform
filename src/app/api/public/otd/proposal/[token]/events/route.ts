import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";
import { notifyOfficeProposalFirstViewed } from "@/lib/proposalNotifications";

const EVENT_TYPES = new Set(["page_open", "heartbeat", "visibility_hidden", "pagehide"]);

function cleanString(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanActiveSeconds(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(Math.round(number), 60 * 60);
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || null;
}

function hashIp(ip: string | null) {
  if (!ip) return null;
  const salt = process.env.NEXTAUTH_SECRET || process.env.N8N_WEBHOOK_SECRET || "devree-platform";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const eventType = cleanString(body.eventType, 64);

  if (!eventType || !EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "Ongeldig event" }, { status: 400 });
  }

  const sessionId = cleanString(body.sessionId, 191);
  const proposal = await prisma.projectProposal.findUnique({
    where: { tokenHash: proposalTokenHash(token) },
    include: { project: true },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Voorstel niet gevonden" }, { status: 404 });
  }

  const viewedAt = new Date();
  const existingSessionOpen = eventType === "page_open" && sessionId
    ? await prisma.projectProposalEvent.findFirst({
        where: { proposalId: proposal.id, eventType: "page_open", sessionId },
        select: { id: true },
      })
    : null;
  const countAsOpen = eventType === "page_open" && !existingSessionOpen;
  const isFirstView = countAsOpen && !proposal.viewedAt;

  await prisma.$transaction(async (tx) => {
    await tx.projectProposalEvent.create({
      data: {
        proposalId: proposal.id,
        eventType,
        sessionId,
        activeSeconds: cleanActiveSeconds(body.activeSeconds),
        path: cleanString(body.path),
        referrer: cleanString(body.referrer),
        viewport: cleanString(body.viewport, 64),
        userAgent: cleanString(request.headers.get("user-agent")),
        ipHash: hashIp(requestIp(request)),
      },
    });

    if (countAsOpen) {
      await tx.projectProposal.update({
        where: { id: proposal.id },
        data: {
          viewedAt: proposal.viewedAt || viewedAt,
          lastViewedAt: viewedAt,
          viewCount: { increment: 1 },
        },
      });
    }
  });

  if (isFirstView) {
    await notifyOfficeProposalFirstViewed({
      project: proposal.project,
      proposalUrl: proposal.publicUrl,
      viewedAt,
    });
  }

  return NextResponse.json({ success: true });
}
