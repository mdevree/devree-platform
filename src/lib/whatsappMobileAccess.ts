import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export type WhatsAppMobileActor = {
  id: string;
  email: string;
  name: string;
  personal: boolean;
  pushSessionId?: string;
};

export function personalWhatsAppAvailable(userId: string) {
  return process.env.WHATSAPP_REPLY_PERSONAL_ENABLED === "1" &&
    !!userId && userId === process.env.WHATSAPP_REPLY_OWNER_USER_ID;
}

export async function whatsappMobileActor(): Promise<WhatsAppMobileActor | null> {
  const session = await auth();
  if (!session?.user.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, active: true },
  });
  if (!user?.active) return null;
  return {
    id: user.id, email: user.email, name: user.name,
    personal: personalWhatsAppAvailable(user.id), pushSessionId: session.pushSessionId,
  };
}

export function sameWhatsAppMobileOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const platformUrl = process.env.NEXTAUTH_URL || process.env.PLATFORM_BASE_URL;
  return origin === (platformUrl ? new URL(platformUrl).origin : req.nextUrl.origin);
}
