import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getContact } from "@/lib/mautic";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await auth()) return new Response(null, { status: 401 });
  const { id } = await params;
  const row = await prisma.pbxRequest.findUnique({ where: { id }, include: { task: true } });
  if (!row) return new Response(null, { status: 404 });
  const b = await req.json();
  if (b.split === true && row.task) {
    const { title,description,priority,dueDate,category,assigneeId,creatorId,projectId } = row.task;
    await prisma.$transaction(async tx => {
      const task = await tx.task.create({ data: { title,description,priority,dueDate,category,assigneeId,creatorId,projectId } });
      await tx.pbxRequest.update({ where: { id }, data: { taskId: task.id } });
    });
  } else if (b.status !== undefined || b.dueDate !== undefined || b.assigneeId !== undefined) {
    if (!row.taskId) return NextResponse.json({ error: "Geen terugbeltaak" }, { status: 400 });
    if (b.status !== undefined && !["open","bezig","wacht_op_klant","afgerond"].includes(b.status)) return new Response(null,{status:400});
    if (b.dueDate !== undefined && !Number.isFinite(Date.parse(b.dueDate))) return new Response(null,{status:400});
    if (b.assigneeId && !await prisma.user.findFirst({where:{id:b.assigneeId,active:true}})) return new Response(null,{status:400});
    await prisma.task.update({ where: { id: row.taskId }, data: {
      ...(b.status !== undefined ? { status:b.status, completedAt:b.status === "afgerond" ? (row.task?.completedAt ?? new Date()) : null } : {}),
      ...(b.dueDate ? { dueDate:new Date(b.dueDate) } : {}), ...(b.assigneeId ? {assigneeId:b.assigneeId} : {}),
    } });
  } else if (b.contactId !== undefined) {
    if (!Number.isSafeInteger(b.contactId) || b.contactId < 1) return new Response(null,{status:400});
    const c = await getContact(b.contactId);
    if (!c) return new Response(null,{status:404});
    await prisma.pbxRequest.update({where:{id},data:{contactId:c.id,contactName:`${c.firstname} ${c.lastname}`.trim()}});
  } else if (typeof b.notes === "string" && b.notes.length <= 10000) {
    await prisma.pbxRequest.update({where:{id},data:{notes:b.notes}});
  } else return new Response(null,{status:400});
  return NextResponse.json({ ok:true });
}
