import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";
import { sendWhatsAppMessage, EvolutionError } from "@/lib/evolution";

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

  let evolutionMsgId: string | null = null;
  try {
    evolutionMsgId = await sendWhatsAppMessage(conversation.waPhone, message);
  } catch (err) {
    const detail =
      err instanceof EvolutionError && err.detail
        ? err.detail
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("WhatsApp verzenden mislukt:", detail);

    // Bewaar het bericht als FAILED zodat het in de UI zichtbaar blijft,
    // niet als verzonden wordt geteld en eventueel opnieuw geprobeerd kan worden.
    const failed = await prisma.waMessage.create({
      data: {
        conversationId: id,
        direction: "OUTBOUND",
        body: message,
        deliveryStatus: "FAILED",
        deliveryError:
          err instanceof Error ? err.message : "Onbekende fout bij verzenden",
      },
    });

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "WhatsApp-bericht kon niet worden verzonden",
        message: failed,
      },
      { status: 502 }
    );
  }

  const saved = await prisma.waMessage.create({
    data: {
      conversationId: id,
      direction: "OUTBOUND",
      body: message,
      deliveryStatus: "SENT",
      evolutionMsgId,
    },
  });

  await prisma.waConversation.update({
    where: { id },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(saved);
}
