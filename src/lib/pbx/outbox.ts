import { applyReceipt } from "./receipts";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { searchContactByPhone } from "@/lib/mautic";
import { normalizePbxPhone, sendingAllowed } from "./core";
import { purgeRecordings } from "./recordings";
export async function processPbxOutbox() {
  await prisma.pbxOutbox.updateMany({ where: { status: "sending", claimedAt: { lt: new Date(Date.now() - 120000) } }, data: { status: "uncertain", error: "Verzenduitkomst onzeker; controleer de WhatsApp-conversatie voor opnieuw verzenden." } });
  const contacts = await prisma.pbxRequest.findMany({ where: { phone: { not: null }, contactCheckedAt: null }, take: 2, orderBy: { receivedAt: "asc" } });
  for (const row of contacts) {
    let contact;
    try { contact = await searchContactByPhone(row.phone!, true); } catch { continue; }
    await prisma.pbxRequest.update({ where: { id: row.id }, data: { contactCheckedAt: new Date(), ...(contact ? { contactId: contact.id, contactName: `${contact.firstname} ${contact.lastname}`.trim() } : {}) } });
  }
  const jobs = await prisma.pbxOutbox.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 20 });
  let sent = 0;
  for (const job of jobs) {
    if (!sendingAllowed(job.phone, process.env.PBX_SEND_MODE, process.env.PBX_TEST_NUMBERS)) continue;
    // Session health is checked BEFORE claiming a message: safe to retry when disconnected.
    if (process.env.WHATSAPP_PROVIDER === "waha") {
      try {
        const r = await fetch(`${process.env.WAHA_API_URL?.replace(/\/$/, "")}/api/sessions/${encodeURIComponent(process.env.WAHA_SESSION || "default")}`, { headers: { "X-Api-Key": process.env.WAHA_API_KEY || "" }, signal: AbortSignal.timeout(4000) });
        if (!r.ok || (await r.json()).status !== "WORKING") break;
      } catch { break; }
    }
    const claim = await prisma.pbxOutbox.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "sending", claimedAt: new Date(), error: null } });
    if (!claim.count) continue;
    try {
      const request = await prisma.pbxRequest.findUniqueOrThrow({ where: { id: job.requestId } });
      const jid = `${job.phone.slice(1)}@s.whatsapp.net`;
      let conversation = await prisma.waConversation.findFirst({ where: { waPhone: jid }, orderBy: { createdAt: "desc" } });
      if (!conversation) conversation = await prisma.waConversation.create({ data: { waPhone: jid, waName: request.contactName, mauticContactId: request.contactId } });
      else conversation = await prisma.waConversation.update({ where: { id: conversation.id }, data: { status: "OPEN" } });
      await prisma.pbxRequest.update({ where: { id: request.id }, data: { conversationId: conversation.id } });
      const providerId = await sendWhatsAppMessage(jid, job.body);
      if (!providerId) throw new Error("Provider gaf geen bericht-ID; aflevering eerst controleren");
      await prisma.waMessage.upsert({ where: { evolutionMsgId: providerId }, update: {}, create: { conversationId: conversation.id, direction: "OUTBOUND", body: job.body, deliveryStatus: "SENT", evolutionMsgId: providerId } });
      await applyReceipt(providerId);
      await prisma.waConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
      await prisma.pbxOutbox.update({ where: { id: job.id }, data: { status: "sent", providerMsgId: providerId, error: null } });
      sent++;
    } catch (e) {
      const error = e instanceof Error ? e.message : "Verzenden mislukt";
      const rejected = /API fout: 4(00|01|03|04|22)\b/.test(error);
      const rateLimited = /API fout: 429\b/.test(error);
      // Never resend after an ambiguous network error; the provider may have accepted it.
      await prisma.pbxOutbox.updateMany({ where: { id: job.id, status: "sending" }, data: { status: rateLimited ? "pending" : rejected ? "failed" : "uncertain", error: error.slice(0, 500) } });
    }
    if (sent >= 2) break;
  }
  await purgeRecordings();
  await prisma.waProviderReceipt.deleteMany({where:{updatedAt:{lt:new Date(Date.now()-90*86400000)}}});
  const value={checkedAt:new Date().toISOString()};
  await prisma.appSetting.upsert({where:{key:"pbx.reception.processor"},create:{key:"pbx.reception.processor",value},update:{value}});
  return { sent, pending: await prisma.pbxOutbox.count({ where: { status: "pending" } }) };
}
export async function reconcilePbxOutgoing(phone: string, body: string, providerId: string, conversationId: string) {
  const normalized = normalizePbxPhone("+" + phone.split("@")[0]);
  if (!normalized) return;
  const jobs = await prisma.pbxOutbox.findMany({ where: { phone: normalized, body, status: { in: ["sending", "uncertain"] }, claimedAt: { gte: new Date(Date.now() - 1800000) } }, take: 2 });
  if (jobs.length !== 1) return;
  await prisma.pbxOutbox.update({ where: { id: jobs[0].id }, data: { status: "sent", providerMsgId: providerId, error: null } });
  await prisma.pbxRequest.update({ where: { id: jobs[0].requestId }, data: { conversationId } });
}
