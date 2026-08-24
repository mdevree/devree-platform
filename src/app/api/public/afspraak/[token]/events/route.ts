import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  APPOINTMENT_EVENT_TYPES,
  appointmentTokenHash,
  recordAppointmentEvent,
} from "@/lib/appointmentConfirmation";
import { appointmentCorsHeaders, appointmentCorsOptions } from "@/lib/appointmentCors";

function cleanString(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
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
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const eventType = cleanString(body.eventType, 64);
  if (!eventType || !APPOINTMENT_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "Ongeldig event" }, { status: 400, headers: appointmentCorsHeaders(request) });
  }

  const confirmation = await prisma.appointmentConfirmation.findUnique({
    where: { tokenHash: appointmentTokenHash(token) },
    select: { id: true, mauticContactId: true },
  });
  if (!confirmation) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404, headers: appointmentCorsHeaders(request) });
  }

  await recordAppointmentEvent({
    confirmationId: confirmation.id,
    mauticContactId: confirmation.mauticContactId,
    eventType,
    sessionId: cleanString(body.sessionId, 191),
    path: cleanString(body.path),
    referrer: cleanString(body.referrer),
    viewport: cleanString(body.viewport, 64),
    userAgent: cleanString(request.headers.get("user-agent")),
    ipHash: hashIp(requestIp(request)),
    clickedUrl: cleanString(body.clickedUrl),
    rawPayload: body,
  });

  return NextResponse.json({ success: true }, { headers: appointmentCorsHeaders(request) });
}

export function OPTIONS(request: NextRequest) {
  return appointmentCorsOptions(request);
}
