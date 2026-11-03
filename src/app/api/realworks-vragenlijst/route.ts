import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { storedVragenlijst } from "@/lib/propertyBriefingStore";
import { extractVragenlijstFields } from "@/lib/vragenlijst";

export async function POST(req: NextRequest) {
  if (!await isAuthorized(req)) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  const text = await req.text();
  if (text.length > 200000) return NextResponse.json({ error: "Formulier te groot" }, { status: 413 });
  try {
    const body = JSON.parse(text);
    const fields = extractVragenlijstFields(body.fields);
    if (!/^[a-zA-Z0-9-]{10,80}$/.test(body.captureId || "")) throw new Error("Ongeldig ontvangst-ID");
    const suppliedForm = body.origin === "provided_form";
    if (!suppliedForm && (!Number.isInteger(body.status) || body.status < 200 || body.status >= 300)) throw new Error("Geen succesvolle HTTP-response van Realworks");
    const capturedAt = new Date(body.capturedAt);
    if (!Number.isFinite(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 300000) throw new Error("Ongeldige ontvangstdatum");
    const id = `vl-${body.captureId}`;
    const source = `vragenlijst:${fields.vllisnr.trim()}`;
    const existing = await prisma.realworksBackupCapture.findUnique({ where: { id } });
    if (existing && (existing.source !== source || existing.requestBodyPreview !== JSON.stringify(fields))) return NextResponse.json({ error: "Ontvangst-ID hoort bij andere gegevens" }, { status: 409 });
    const list = await storedVragenlijst(fields);
    await prisma.realworksBackupCapture.upsert({ where: { id }, update: {}, create: {
      id, source, capturedAt, host: "crm.realworks.nl", path: "/servlets/objects/broker.nvmvragenlijst/saveQuestionlist",
      url: "https://crm.realworks.nl/servlets/objects/broker.nvmvragenlijst/saveQuestionlist", method: "POST", status: suppliedForm ? null : body.status,
      transport: suppliedForm ? "user_supplied_form" : "extension_webrequest", requestBodyPreview: JSON.stringify(fields),
    } });
    const projects = await prisma.project.findMany({ where: { realworksId: list.objectcode }, select: { id: true, name: true } });
    return NextResponse.json({ ok: true, objectcode: list.objectcode, items: list.items.length, projects, duplicate: !!existing });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && !error.name.startsWith("Prisma"))) return NextResponse.json({ error: error instanceof Error ? error.message : "Ongeldig formulier" }, { status: 400 });
    throw error;
  }
}
