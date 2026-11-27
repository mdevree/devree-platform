import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sameWhatsAppMobileOrigin, whatsappMobileActor } from "@/lib/whatsappMobileAccess";
import { sendWhatsAppWebPush } from "@/lib/whatsappWebPush";
import { webPushConfig } from "@/lib/whatsappWebPushConfig";

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  if (!sameWhatsAppMobileOrigin(req)) return reply({ error: "Ongeldige herkomst." }, 403);
  const actor = await whatsappMobileActor();
  if (!actor) return reply({ error: "Log opnieuw in." }, 401);
  if (!actor.pushSessionId) return reply({ error: "Log uit en opnieuw in om dit toestel te gebruiken." }, 409);
  const config = webPushConfig();
  if (!config) return reply({ error: "Webmeldingen zijn nog niet beschikbaar." }, 503);

  const { deviceId } = await req.json().catch(() => ({})) ?? {};
  if (typeof deviceId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(deviceId)) {
    return reply({ error: "Ongeldig toestel." }, 400);
  }

  const registered = {
    id: deviceId.toLowerCase(),
    userId: actor.id,
    sessionId: actor.pushSessionId,
    OR: [
      { officeSince: { not: null } },
      ...(actor.personal ? [{ personalSince: { not: null } }] : []),
    ],
  };
  const device = await prisma.waWebPushDevice.findFirst({ where: registered });
  if (!device) return reply({ error: "Zet eerst meldingen aan op dit toestel." }, 404);
  const cutoff = new Date(Date.now() - 60_000);
  const claim = await prisma.waWebPushDevice.updateMany({
    where: { AND: [registered, { updatedAt: device.updatedAt }, { OR: [{ lastTestAt: null }, { lastTestAt: { lte: cutoff } }] }] },
    data: { lastTestAt: new Date() },
  });
  if (!claim.count) return reply({ error: "Wacht een minuut voordat je weer test." }, 429);

  const result = await sendWhatsAppWebPush(config, device, {
    draft: null,
    body: "Webmeldingen staan aan op dit toestel.",
  });
  if (result.invalid) {
    await prisma.waWebPushDevice.deleteMany({
      where: { ...registered, endpointHash: device.endpointHash, p256dh: device.p256dh, authKey: device.authKey },
    });
    return reply({ error: "Deze registratie is verlopen. Zet meldingen opnieuw aan." }, 410);
  }
  if (result.status < 200 || result.status >= 300) {
    return reply({ error: "De testmelding kon niet worden aangeboden. Probeer het over een minuut opnieuw." }, 502);
  }
  return reply({ ok: true });
}
