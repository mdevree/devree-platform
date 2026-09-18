import { Prisma } from "@prisma/client";
import { defaultPbxConfig, type PbxConfig } from "@/lib/pbx/core";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pbxServiceAuthorized } from "@/lib/pbx/auth";
import { getPbxConfig } from "@/lib/pbx/store";
import { effectiveMode, validateConfig } from "@/lib/pbx/core";
export async function GET(req: Request) {
  if (!pbxServiceAuthorized(req) && !await auth()) return new Response(null, { status: 401 });
  const config = await getPbxConfig();
  const heartbeat = await prisma.appSetting.findUnique({ where: { key: "pbx.reception.heartbeat" } });
  return NextResponse.json({ config, effectiveMode: effectiveMode(config), heartbeat: heartbeat?.value ?? null, sendMode: process.env.PBX_SEND_MODE || "off" });
}
export async function PATCH(req: Request) {
  if (!await auth()) return new Response(null, { status: 401 });
  try {
    const input = await req.json();
    const config = validateConfig(input, await getPbxConfig());
    if (config.ownerId && !await prisma.user.findFirst({ where: { id: config.ownerId, active: true } })) throw new Error("Onbekende medewerker");
    await prisma.$transaction(async tx => {
      const current=await tx.appSetting.findUnique({where:{key:"pbx.reception.config"}});
      const previous={...defaultPbxConfig,...(current?.value as Partial<PbxConfig> ?? {})};
      if(input.version!==previous.version)throw new Error("De instellingen zijn ondertussen gewijzigd. Vernieuw de pagina.");
      await tx.appSetting.upsert({ where: { key: "pbx.reception.config" }, create: { key: "pbx.reception.config", value: config }, update: { value: config } });
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({ config });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Ongeldige instelling" }, { status: 400 }); }
}
