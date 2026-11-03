import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getVragenlijst } from "@/lib/vragenlijstStore";
import { getLijstVanZaken } from "@/lib/lijstVanZakenStore";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthorized(req)) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { realworksId: true } });
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  const [list, questions] = await Promise.all([getLijstVanZaken(project.realworksId), getVragenlijst(project.realworksId)]);
  return NextResponse.json({ list, questions });
}
