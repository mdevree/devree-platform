import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { approveIssue, mutateIssue } from "@/lib/newsletter/editor";
import { normalizeSegmentIds } from "@/lib/newsletter";

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const include = {
  blocks: {
    orderBy: { position: "asc" as const },
    include: { item: true },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const issue = await prisma.newsletterIssue.findUnique({ where: { id }, include });
  if (!issue) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });

  return NextResponse.json({ issue });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();
  if(data.status === "READY") {
    const session = await auth();
    if(!session?.user?.email) return NextResponse.json({error:"Goedkeuren vereist een ingelogde gebruiker"},{status:403});
    if(Object.keys(data).some(key=>key!=="status")) return NextResponse.json({error:"Sla wijzigingen eerst apart op"},{status:400});
    try { return NextResponse.json({issue:await approveIssue(id, session.user.email)}); }
    catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Goedkeuren mislukt"},{status:409}); }
  }
  if(data.status && data.status!=="DRAFT") return NextResponse.json({error:"Ongeldige statusovergang"},{status:400});
  try {
  const issue = await mutateIssue(id, tx => tx.newsletterIssue.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: cleanString(data.name) || "" } : {}),
      ...(data.subject !== undefined ? { subject: cleanString(data.subject) || "" } : {}),
      ...(data.preheader !== undefined ? { preheader: cleanString(data.preheader) } : {}),

      ...(data.segmentIds !== undefined ? { segmentIds: normalizeSegmentIds(data.segmentIds) } : {}),
    },
    include,
  }));

  return NextResponse.json({ issue });
  } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Opslaan mislukt"},{status:409}); }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const current=await prisma.newsletterIssue.findUnique({where:{id}});
  if(current?.mauticEmailId || current?.exportAttemptedAt) return NextResponse.json({error:"Een gekoppelde editie kan niet worden verwijderd"},{status:409});
  try { await mutateIssue(id, tx=>tx.newsletterIssue.delete({where:{id}})); }
  catch(e) {return NextResponse.json({error:e instanceof Error?e.message:"Verwijderen mislukt"},{status:409});}

  return NextResponse.json({ success: true });
}
