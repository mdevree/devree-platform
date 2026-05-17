import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { sendWhatsAppMessage } from "@/lib/evolution";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const { message } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: "Bericht mag niet leeg zijn" }, { status: 400 });
  }

  const conversation = await prisma.waConversation.findUnique({ where: { id } });
  if (!conversation) {
    return NextResponse.json({ error: "Gesprek niet gevonden" }, { status: 404 });
  }

  await sendWhatsAppMessage(conversation.waPhone, message);

  const saved = await prisma.waMessage.create({
    data: { conversationId: id, direction: "OUTBOUND", body: message },
  });

  await prisma.waConversation.update({
    where: { id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(saved);
}
