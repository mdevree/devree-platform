import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pbxServiceAuthorized } from "@/lib/pbx/auth";
export async function POST(req: Request) {
  if (!pbxServiceAuthorized(req)) return new Response(null, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || !Number.isSafeInteger(b.appliedVersion) || !Number.isSafeInteger(b.pending) || b.pending < 0) return new Response(null, { status: 400 });
  const value = { checkedAt: new Date().toISOString(), appliedVersion: b.appliedVersion, pending: b.pending, audioReady: b.audioReady === true, asteriskReady: b.asteriskReady === true, storageReady: b.storageReady === true, oldestPendingAt: typeof b.oldestPendingAt === "string" ? b.oldestPendingAt.slice(0,50) : null, testRouteOnly: b.testRouteOnly !== false };
  await prisma.appSetting.upsert({ where: { key: "pbx.reception.heartbeat" }, create: { key: "pbx.reception.heartbeat", value }, update: { value } });
  const expired = await prisma.pbxRequest.findMany({ where: { OR: [{ recordingDeletedAt: { not: null } }, { task: { status: "afgerond", completedAt: { lt: new Date(Date.now() - 30*86400000) } } }] }, select: { callId: true } });
  return NextResponse.json({ ok: true, deleteRecordings: expired.map(r => r.callId) });
}
