import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { searchContactByPhone, createContact } from "@/lib/mautic";
import { normalizePhoneNumber } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (
    process.env.EVOLUTION_WEBHOOK_SECRET &&
    secret !== process.env.EVOLUTION_WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

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
  }

  return NextResponse.json({ ok: true });
}
