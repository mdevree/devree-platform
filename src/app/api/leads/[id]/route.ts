import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { locked, registerInTransaction, correctInTransaction, ReferralError } from "@/lib/hypotheek/service";
import { actor, failure } from "@/lib/hypotheek/http";
import { isAuthorized } from "@/lib/apiAuth";

/**
 * GET /api/leads/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      doorverwijzingDeelnames: true,
      hypotheekAdviseur: true,
      projecten: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
              type: true,
              projectStatus: true,
              woningAdres: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      },
      routes: {
        orderBy: { routedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ lead });
}

/**
 * PATCH /api/leads/[id]
 * Accepteert: naam, email, telefoon, mauticContactId, status, prioriteit, source, tags,
 *             notities, hypotheekAdviseurId, hypotheekAdviseurDatum, hypotheekAfgesloten
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const data = await request.json();

  const user=await actor();
  try { return await locked(async tx=>{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  if (data.naam !== undefined) updateData.naam = data.naam;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.telefoon !== undefined) updateData.telefoon = data.telefoon || null;
  if (data.mauticContactId !== undefined) updateData.mauticContactId = data.mauticContactId || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.prioriteit !== undefined) updateData.prioriteit = data.prioriteit;
  if (data.source !== undefined) updateData.source = data.source || null;
  if (data.tags !== undefined) updateData.tags = data.tags ?? null;
  if (data.notities !== undefined) updateData.notities = data.notities || null;
  const hasReferral = ["hypotheekAdviseurId","hypotheekAdviseurDatum","hypotheekAfgesloten"].some(k=>data[k]!==undefined);
  if(hasReferral) {
    const current=await tx.lead.findUniqueOrThrow({where:{id}});
    const membership=await tx.hypotheekDeelname.findFirst({where:{leadId:id,adviseurId:current.hypotheekAdviseurId||""}});
    if(data.hypotheekAdviseurId===null || data.hypotheekAdviseurId==="")throw new ReferralError("Open de doorverwijzing om de adviseur te wijzigen; historie kan niet worden losgekoppeld.",409,membership?.doorverwijzingId);
    const fields={...(data.hypotheekAdviseurId?{adviseurId:data.hypotheekAdviseurId}:{}),...(data.hypotheekAdviseurDatum!==undefined?{datum:data.hypotheekAdviseurDatum?String(data.hypotheekAdviseurDatum).slice(0,10):null}:{}),...(data.hypotheekAfgesloten!==undefined?{hypotheekAfgesloten:data.hypotheekAfgesloten}:{})};
    if(membership)await correctInTransaction(tx,membership.doorverwijzingId,fields,user);
    else if(fields.adviseurId)await registerInTransaction(tx,{...fields,adviseurId:fields.adviseurId,contacten:[{leadId:id}]},user);
    else throw new ReferralError("Koppel eerst een hypotheekadviseur.");
  }

  const lead = await tx.lead.update({
    where: { id },
    data: updateData,
    include: {
      hypotheekAdviseur: { select: { id: true, naam: true, bedrijf: true } },
      _count: { select: { projecten: true, routes: true } },
    },
  });

  return NextResponse.json({ success: true, lead });
  }); } catch(e) { return failure(e); }
}

/**
 * DELETE /api/leads/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead niet gevonden" }, { status: 404 });
  }

  const membership=await prisma.hypotheekDeelname.findFirst({where:{leadId:id}});
  if(membership)return NextResponse.json({error:"Dit contact heeft een doorverwijzing. De historie blijft bewaard; zet het contact zo nodig op inactief.",existingId:membership.doorverwijzingId},{status:409});
  try { await prisma.lead.delete({ where: { id } }); } catch { return NextResponse.json({error:"Contact heeft inmiddels een koppeling en kan niet worden verwijderd."},{status:409}); }

  return NextResponse.json({ success: true });
}
