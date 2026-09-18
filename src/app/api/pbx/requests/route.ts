import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function GET(req: Request) {
  if (!await auth()) return new Response(null, { status: 401 });
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(url.searchParams.get("page"))) || 1));
  const status = url.searchParams.get("status") || "active";
  const where = status === "active" ? { task: { status: { not: "afgerond" } } } : status === "done" ? { task: { status: "afgerond" } } : { taskId: null };
  const [rows, total] = await Promise.all([
    prisma.pbxRequest.findMany({ where, orderBy: { receivedAt: status === "active" ? "asc" : "desc" }, skip: (page-1)*50, take: 50, include: { task: { include: { assignee: { select: { id:true, name:true } }, project: { select: { id:true, name:true } } } } } }),
    prisma.pbxRequest.count({ where }),
  ]);
  const outbox = await prisma.pbxOutbox.findMany({ where: { requestId: { in: rows.map(r => r.id) } }, select: { requestId: true, status:true, error:true, providerMsgId:true } });
  const providerIds = outbox.flatMap(o=>o.providerMsgId ? [o.providerMsgId] : []);
  const messages = await prisma.waMessage.findMany({ where: { evolutionMsgId: { in: providerIds } }, select: { evolutionMsgId:true, deliveryStatus:true } });
  return NextResponse.json({ rows: rows.map(r=>({ ...r, messages: outbox.filter(o=>o.requestId===r.id).map(o=>({ ...o, delivery: messages.find(m=>m.evolutionMsgId===o.providerMsgId)?.deliveryStatus ?? null })) })), total, page });
}
