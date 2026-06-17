import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorized } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") ?? "OPEN") as "OPEN" | "CLOSED";

  const conversations = await prisma.waConversation.findMany({
    where: { status },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(conversations);
}

function toStorageJid(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let international = digits;
  if (digits.startsWith("00")) international = digits.slice(2);
  else if (digits.startsWith("0")) international = `31${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith("6")) international = `31${digits}`;

  if (international.length < 10) return null;
  return `${international}@s.whatsapp.net`;
}

export async function POST(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const waPhone = typeof body.phone === "string" ? toStorageJid(body.phone) : null;
  const mauticContactId = Number.isFinite(Number(body.mauticContactId))
    ? Number(body.mauticContactId)
    : null;
  const waName = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : null;

  if (!waPhone) {
    return NextResponse.json({ error: "Geen geldig telefoonnummer" }, { status: 400 });
  }

  const existing = await prisma.waConversation.findFirst({ where: { waPhone } });
  const conversation = existing
    ? await prisma.waConversation.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          waName: existing.waName || waName,
          mauticContactId: existing.mauticContactId ?? mauticContactId,
          lastMessageAt: existing.lastMessageAt,
        },
      })
    : await prisma.waConversation.create({
        data: {
          waPhone,
          waName,
          mauticContactId,
          status: "OPEN",
        },
      });

  return NextResponse.json(conversation);
}
