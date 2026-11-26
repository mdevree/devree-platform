import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sameWhatsAppMobileOrigin, whatsappMobileActor } from "@/lib/whatsappMobileAccess";
import { isPreviewKey } from "@/lib/whatsappPushPayload";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: NextRequest) {
  const actor = await whatsappMobileActor();
  if (!actor) return reply({ error: "Log opnieuw in." }, 401);
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId || !uuid.test(deviceId)) return reply({ error: "Ongeldig toestel." }, 400);
  const device = await prisma.waDraftPushDevice.findFirst({ where: { id: deviceId, userId: actor.id } });
  return reply({
    office: !!device?.officeSince,
    personal: actor.personal && !!device?.personalSince,
    personalAvailable: actor.personal,
  });
}

export async function POST(req: NextRequest) {
  if (!sameWhatsAppMobileOrigin(req)) return reply({ error: "Ongeldige herkomst." }, 403);
  const actor = await whatsappMobileActor();
  if (!actor) return reply({ error: "Log opnieuw in." }, 401);
  const data = await req.json().catch(() => null);
  if (typeof data?.deviceId !== "string" || !uuid.test(data.deviceId) ||
      typeof data.office !== "boolean" || typeof data.personal !== "boolean") {
    return reply({ error: "Ongeldige meldingsinstellingen." }, 400);
  }
  const { deviceId, office, personal, environment, token, publicKey } = data;
  if (!office && !personal) {
    await prisma.waDraftPushDevice.deleteMany({ where: { id: deviceId, userId: actor.id } });
    return reply({ office: false, personal: false, personalAvailable: actor.personal });
  }
  if (!actor.pushSessionId) return reply({ error: "Log uit en opnieuw in om dit toestel voor meldingen te registreren." }, 409);
  if (personal && !actor.personal) return reply({ error: "Persoonlijke meldingen zijn niet beschikbaar." }, 403);
  if (!["development", "production"].includes(environment) ||
      typeof token !== "string" || !/^(?:[a-f0-9]{2}){16,128}$/i.test(token) || !isPreviewKey(publicKey)) {
    return reply({ error: "De app heeft nog geen geldige registratie voor dit toestel." }, 400);
  }

  const canonicalToken = token.toLowerCase();
  await prisma.$transaction(async (tx) => {
    const old = await tx.waDraftPushDevice.findUnique({ where: { id: deviceId } });
    if (old && old.userId !== actor.id) await tx.waDraftPushDevice.delete({ where: { id: deviceId } });
    await tx.waDraftPushDevice.deleteMany({
      where: { id: { not: deviceId }, token: canonicalToken, environment },
    });
    const current = old?.userId === actor.id ? old : null;
    const now = new Date();
    const registration = {
      userId: actor.id, sessionId: actor.pushSessionId!, token: canonicalToken, environment, publicKey,
      officeSince: office ? current?.officeSince ?? now : null,
      personalSince: personal ? current?.personalSince ?? now : null,
    };
    await tx.waDraftPushDevice.upsert({
      where: { id: deviceId },
      create: { id: deviceId, ...registration },
      update: registration,
    });
  });

  return reply({ office, personal, personalAvailable: actor.personal });
}
