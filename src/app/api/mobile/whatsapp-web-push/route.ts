import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sameWhatsAppMobileOrigin, whatsappMobileActor } from "@/lib/whatsappMobileAccess";
import { getWebPushSubscription, webPushConfig } from "@/lib/whatsappWebPushConfig";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: NextRequest) {
  const actor = await whatsappMobileActor();
  if (!actor) return reply({ error: "Log opnieuw in." }, 401);
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId || !uuid.test(deviceId)) return reply({ error: "Ongeldig toestel." }, 400);

  const config = webPushConfig();
  const device = actor.pushSessionId ? await prisma.waWebPushDevice.findFirst({
    where: { id: deviceId.toLowerCase(), userId: actor.id, sessionId: actor.pushSessionId },
    select: { officeSince: true, personalSince: true },
  }) : null;
  return reply({
    enabled: Boolean(config),
    publicKey: config?.publicKey ?? null,
    office: Boolean(device?.officeSince),
    personal: actor.personal && Boolean(device?.personalSince),
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

  const id = data.deviceId.toLowerCase();
  const { office, personal } = data;
  const config = webPushConfig();
  const availability = {
    enabled: Boolean(config),
    publicKey: config?.publicKey ?? null,
    personalAvailable: actor.personal,
  };
  if (!office && !personal) {
    await prisma.waWebPushDevice.deleteMany({ where: { id, userId: actor.id } });
    return reply({ ...availability, office: false, personal: false });
  }

  const sessionId = actor.pushSessionId;
  if (!sessionId) return reply({ error: "Log uit en opnieuw in om browsermeldingen aan te zetten." }, 409);
  if (personal && !actor.personal) return reply({ error: "Persoonlijke meldingen zijn niet beschikbaar." }, 403);
  if (!config) return reply({ error: "Browsermeldingen zijn nog niet beschikbaar." }, 503);
  const subscription = getWebPushSubscription(data.subscription);
  if (!subscription) return reply({ error: "De browser heeft geen geldige registratie voor dit toestel." }, 400);
  const endpointHash = createHash("sha256").update(subscription.endpoint).digest("hex");

  const updated = await prisma.$transaction(async (tx) => {
    const ownedId = await tx.waWebPushDevice.findUnique({ where: { id } });
    const ownedEndpoint = await tx.waWebPushDevice.findUnique({ where: { endpointHash } });
    if ([ownedId, ownedEndpoint].some((device) => device && device.userId !== actor.id)) return false;

    const sameRegistration = ownedId?.endpointHash === endpointHash &&
      ownedId.sessionId === sessionId &&
      ownedId.p256dh === subscription.p256dh &&
      ownedId.authKey === subscription.authKey;
    if (ownedEndpoint && ownedEndpoint.id !== id) {
      await tx.waWebPushDevice.deleteMany({ where: { id: ownedEndpoint.id, userId: actor.id, endpointHash } });
    }
    if (ownedId && !sameRegistration) {
      await tx.waWebPushDelivery.deleteMany({ where: { deviceId: id, device: { userId: actor.id } } });
    }

    const now = new Date();
    const registration = {
      userId: actor.id,
      sessionId,
      ...subscription,
      endpointHash,
      officeSince: office ? (sameRegistration ? ownedId.officeSince : null) ?? now : null,
      personalSince: personal ? (sameRegistration ? ownedId.personalSince : null) ?? now : null,
    };
    await tx.waWebPushDevice.upsert({
      where: { id, userId: actor.id },
      create: { id, ...registration },
      update: registration,
    });
    return true;
  }).catch((error: unknown) => {
    // Identical browser registrations may be submitted concurrently by multiple pages.
    if (error && typeof error === "object" && "code" in error &&
        ["P2002", "P2025", "P2034"].includes(String(error.code))) return false;
    throw error;
  });

  if (!updated) return reply({ error: "Deze registratie is gewijzigd. Open de meldingsinstellingen opnieuw." }, 409);
  return reply({ ...availability, office, personal });
}
