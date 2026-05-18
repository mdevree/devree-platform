import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const conversation = await prisma.waConversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Gesprek niet gevonden" }, { status: 404 });
  }

  await prisma.waConversation.update({
    where: { id },
    data: { status: "CLOSED" },
  });

  const summaryUrl = process.env.N8N_WEBHOOK_WHATSAPP_SUMMARY_URL;
  if (summaryUrl) {
    const transcript = conversation.messages
      .map((m) => `[${m.direction === "INBOUND" ? "Klant" : "Kantoor"}] ${m.body}`)
      .join("\n");

    fetch(summaryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        conversationId: conversation.id,
        waPhone: conversation.waPhone,
        waName: conversation.waName,
        mauticContactId: conversation.mauticContactId,
        transcript,
        closedAt: new Date().toISOString(),
      }),
    }).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
