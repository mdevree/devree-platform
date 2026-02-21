import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * GET /api/instellingen
 * Haal alle app-instellingen op als key-value object
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const settings = await prisma.appSetting.findMany();

  // Zet om naar key-value object
  const result: Record<string, unknown> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  return NextResponse.json(result);
}

/**
 * PATCH /api/instellingen
 * Sla één of meerdere instellingen op
 * Body: { key: string, value: unknown } of { settings: { key: string, value: unknown }[] }
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const data = await request.json();

  // Ondersteuning voor zowel enkelvoudige als batch-updates
  const updates: { key: string; value: unknown }[] = [];

  if (data.settings && Array.isArray(data.settings)) {
    updates.push(...data.settings);
  } else if (data.key !== undefined) {
    updates.push({ key: data.key, value: data.value });
  } else {
    // Object met key-value paren
    for (const [key, value] of Object.entries(data)) {
      updates.push({ key, value });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Geen instellingen meegegeven" }, { status: 400 });
  }

  await prisma.$transaction(
    updates.map(({ key, value }) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: value as Parameters<typeof prisma.appSetting.upsert>[0]["update"]["value"] },
        create: { key, value: value as Parameters<typeof prisma.appSetting.create>[0]["data"]["value"] },
      })
    )
  );

  return NextResponse.json({ success: true });
}
