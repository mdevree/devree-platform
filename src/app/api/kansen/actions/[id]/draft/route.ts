import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

function draftWebhookUrl() {
  if (process.env.KANSEN_DRAFT_WEBHOOK_URL) return process.env.KANSEN_DRAFT_WEBHOOK_URL;
  if (process.env.N8N_URL) return `${process.env.N8N_URL.replace(/\/$/, "")}/webhook/kansen-concept`;
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
  const opportunity = await prisma.actionOpportunity.findUnique({ where: { id } });
  if (!opportunity) {
    return NextResponse.json({ error: "Kans niet gevonden" }, { status: 404 });
  }

  const webhookUrl = draftWebhookUrl();
  if (!webhookUrl) {
    const updated = await prisma.actionOpportunity.update({
      where: { id },
      data: {
        draftStatus: "requested",
        draftChannel: channel,
        draftRequestedAt: new Date(),
      },
    });
    return NextResponse.json({
      success: true,
      queued: false,
      reason: "Geen KANSEN_DRAFT_WEBHOOK_URL of N8N_URL geconfigureerd",
      opportunity: updated,
    });
  }

  const updated = await prisma.actionOpportunity.update({
    where: { id },
    data: {
      draftStatus: "requested",
      draftChannel: channel,
      draftRequestedAt: new Date(),
    },
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.N8N_WEBHOOK_SECRET
        ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify({
      action: "create_draft",
      channel,
      opportunity: updated,
      context: {
        contact: {
          name: updated.contactName,
          email: updated.contactEmail,
          phone: updated.contactPhone,
          mauticContactId: updated.mauticContactId,
        },
        object: {
          exchangeObjectId: updated.exchangeObjectId,
          address: updated.objectAddress,
          city: updated.objectCity,
          price: updated.objectPrice,
        },
        reason: updated.reason,
        suggestedAction: updated.suggestedAction,
      },
    }),
  });

  return NextResponse.json({
    success: true,
    queued: res.ok,
    webhookStatus: res.status,
    opportunity: updated,
  });
}
