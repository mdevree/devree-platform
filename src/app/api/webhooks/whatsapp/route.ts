import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchContactByPhone, createContact, addContactPoints } from "@/lib/mautic";
import { normalizePhoneNumber } from "@/lib/phone";

// Zet WHATSAPP_WEBHOOK_DEBUG=1 om binnenkomende events gestructureerd te loggen
// (event-type, afzender, secret-match) tijdens het diagnosticeren van de inbox.
const DEBUG = process.env.WHATSAPP_WEBHOOK_DEBUG === "1";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  const secretMatch =
    !process.env.EVOLUTION_WEBHOOK_SECRET ||
    secret === process.env.EVOLUTION_WEBHOOK_SECRET;

  const body = await req.json();

  if (DEBUG) {
    console.log("[wa-webhook]", {
      event: body?.event,
      from: body?.data?.key?.remoteJid,
      fromMe: body?.data?.key?.fromMe,
      secretMatch,
    });
  }

  if (
    process.env.EVOLUTION_WEBHOOK_SECRET &&
    secret !== process.env.EVOLUTION_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.event !== "messages.upsert") {
    return NextResponse.json({ ok: true });
  }

  const msg = body.data;
  if (!msg || msg.key?.fromMe) {
    return NextResponse.json({ ok: true });
  }

  const waPhone: string = msg.key?.remoteJid ?? "";
  if (!waPhone || waPhone.includes("@g.us")) {
    return NextResponse.json({ ok: true });
  }

  const waName: string | undefined = msg.pushName ?? undefined;
  const bodyText: string =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    "[media bericht]";
  const evolutionMsgId: string | undefined = msg.key?.id ?? undefined;

  let conversation = await prisma.waConversation.findFirst({
    where: { waPhone },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation || conversation.status === "CLOSED") {
    // Zoek of maak Mautic contact — strip @s.whatsapp.net en normaliseer
    const rawNumber = waPhone.replace("@s.whatsapp.net", "");
    const { plus31 } = normalizePhoneNumber(rawNumber.startsWith("31") ? `+${rawNumber}` : rawNumber);
    let mauticContactId: number | null = null;

    try {
      const existing = await searchContactByPhone(plus31);
      if (existing) {
        mauticContactId = existing.id;
      } else {
        const nameParts = (waName ?? "").split(" ");
        const created = await createContact({
          firstname: nameParts[0] ?? "",
          lastname: nameParts.slice(1).join(" ") ?? "",
          phone: plus31,
        });
        mauticContactId = created?.id ?? null;
      }
    } catch (err) {
      console.error("Mautic contact fout:", err);
    }

    conversation = await prisma.waConversation.create({
      data: { waPhone, waName, mauticContactId, status: "OPEN" },
    });
  } else if (waName && !conversation.waName) {
    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { waName },
    });
  }

  const existing = evolutionMsgId
    ? await prisma.waMessage.findUnique({ where: { evolutionMsgId } })
    : null;

  if (!existing) {
    await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        body: bodyText,
        evolutionMsgId,
      },
    });

    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Een inkomende WhatsApp-reactie is een engagement-signaal → voed Mautic.
    if (conversation.mauticContactId) {
      try {
        await addContactPoints(conversation.mauticContactId, 2);
      } catch (err) {
        console.error("Kon WhatsApp-punten niet naar Mautic schrijven:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
