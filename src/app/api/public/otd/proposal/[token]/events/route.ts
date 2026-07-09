import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proposalTokenHash } from "@/lib/projectProposal";

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

  const proposal = await prisma.projectProposal.findUnique({
    where: { tokenHash: proposalTokenHash(token) },
    select: { id: true },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Voorstel niet gevonden" }, { status: 404 });
  }

  await prisma.projectProposalEvent.create({
    data: {
      proposalId: proposal.id,
      eventType,
      sessionId: cleanString(body.sessionId, 191),
      activeSeconds: cleanActiveSeconds(body.activeSeconds),
      path: cleanString(body.path),
      referrer: cleanString(body.referrer),
      viewport: cleanString(body.viewport, 64),
      userAgent: cleanString(request.headers.get("user-agent")),
      ipHash: hashIp(requestIp(request)),
    },
  });

  return NextResponse.json({ success: true });
}
