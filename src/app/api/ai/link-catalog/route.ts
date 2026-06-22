import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const active = searchParams.get("active");

  const items = await prisma.aiLinkCatalogItem.findMany({
    where: {
      ...(type && type !== "alle" ? { type } : {}),
      ...(active === "true" ? { active: true } : active === "false" ? { active: false } : {}),
    },
    orderBy: [{ active: "desc" }, { type: "asc" }, { title: "asc" }],
    take: 300,
  });

  return NextResponse.json(items);
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id ontbreekt" }, { status: 400 });
  }

  const item = await prisma.aiLinkCatalogItem.update({
    where: { id: body.id },
    data: {
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.aiDescription === "string" ? { aiDescription: body.aiDescription } : {}),
      ...(typeof body.whatsappTemplate === "string" ? { whatsappTemplate: body.whatsappTemplate } : {}),
      ...(Array.isArray(body.intents) ? { intents: body.intents.map(String) } : {}),
    },
  });

  return NextResponse.json(item);
}
