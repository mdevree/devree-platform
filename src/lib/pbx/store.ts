import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callbackDue, CALLBACK_TEXT, VIEWING_TEXT, defaultPbxConfig, type PbxConfig, type PbxEventInput } from "./core";
export async function getPbxConfig(): Promise<PbxConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: "pbx.reception.config" } });
  return { ...defaultPbxConfig, ...(row?.value as object ?? {}) };
}
export async function receivePbxEvent(e: PbxEventInput) {
  const cfg = await getPbxConfig();
  const owners = cfg.ownerId
    ? await prisma.user.findMany({ where: { id: cfg.ownerId, active: true }, select: { id: true } })
    : await prisma.user.findMany({ where: { name: { startsWith: "Melvin" }, active: true }, select: { id: true } });
  if (e.kind === "callback" && owners.length !== 1) throw new Error("Stel eerst de verantwoordelijke medewerker in");
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const duplicate = await tx.pbxEvent.findUnique({ where: { id: e.eventId } });
        if (duplicate && duplicate.callId !== e.callId) throw new Error("Gebeurtenis-ID hoort bij een ander gesprek");
        let row = await tx.pbxRequest.findUnique({ where: { callId: e.callId } });
        if (duplicate) return row;
        if (row && (row.phone !== e.phone || row.kind !== e.kind)) throw new Error("Gespreksidentiteit kan niet wijzigen");
        if (!row) {
          let taskId: string | null = null;
          if (e.kind === "callback") {
            const previous = e.phone ? await tx.pbxRequest.findFirst({ where: { phone: e.phone, kind: "callback", task: { status: { not: "afgerond" } } }, orderBy: { receivedAt: "desc" } }) : null;
            taskId = previous?.taskId ?? null;
            if (!taskId) {
              const task = await tx.task.create({ data: {
                title: e.phone ? `Terugbelverzoek: ${e.phone}` : "PBX-bericht: nummer ontbreekt — uitzoeken",
                description: "Ontvangen via het PBX-keuzemenu. Bekijk de opname en conversatie onder Telefonie → PBX-opvang.",
                assigneeId: owners[0].id, creatorId: owners[0].id, category: "binnendienst",
                dueDate: callbackDue(new Date(e.receivedAt), cfg.closedDates),
              } });
              taskId = task.id;
            }
          }
          row = await tx.pbxRequest.create({ data: { callId: e.callId, kind: e.kind, phone: e.phone, receivedAt: new Date(e.receivedAt), revision: e.revision, taskId, consentAt: e.consentAt ? new Date(e.consentAt) : null } });
        } else if (e.revision > row.revision || (e.consentAt && !row.consentAt)) {
          row = await tx.pbxRequest.update({ where: { id: row.id }, data: { revision: Math.max(row.revision, e.revision), consentAt: row.consentAt ?? (e.consentAt ? new Date(e.consentAt) : null) } });
        }
        if (row.consentAt && row.phone) {
          const key = row.kind === "callback" ? `callback:${row.taskId}` : `viewing:${row.callId}`;
          const recent = row.kind === "viewing" ? await tx.pbxOutbox.findFirst({ where: { phone: row.phone, dedupeKey: { startsWith: "viewing:" }, createdAt: { gte: new Date(Date.now() - 86400000) } } }) : null;
          if (!recent) await tx.pbxOutbox.upsert({ where: { dedupeKey: key }, update: {}, create: { dedupeKey: key, requestId: row.id, phone: row.phone, body: row.kind === "callback" ? CALLBACK_TEXT : VIEWING_TEXT } });
        }
        await tx.pbxEvent.create({ data: { id: e.eventId, callId: e.callId } });
        return row;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 });
    } catch (err) {
      if (attempt < 3 && err instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(err.code)) continue;
      throw err;
    }
  }
}
