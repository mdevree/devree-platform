import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { appointmentPhase, appointmentPeriod, appointmentTiming } from "@/lib/appointmentLifecycle";
import { appointmentEventLabels, historyPage, mirroredAppointmentEvent, type HistoryItem } from "@/lib/contactHistory";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthorized(req)) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  const contactId = Number((await params).id);
  if (!Number.isSafeInteger(contactId) || contactId <= 0) return NextResponse.json({ error: "Ongeldig contact" }, { status: 400 });
  const category = req.nextUrl.searchParams.get("category");
  if (category && !["appointments", "whatsapp", "calls", "activity"].includes(category)) return NextResponse.json({ error: "Ongeldig filter" }, { status: 400 });
  const cursor = req.nextUrl.searchParams.get("cursor");
  try { historyPage([], cursor, category); } catch { return NextResponse.json({ error: "Ongeldige cursor" }, { status: 400 }); }

  const [appointments, confirmations, drafts, calls, mautic] = await Promise.all([
    prisma.agendaAfspraak.findMany({ where: { mauticContactId: contactId }, select: { id: true, agbegin: true, agdescr: true, agtype: true, agstatus: true }, orderBy: { agbegin: "desc" } }),
    prisma.appointmentConfirmation.findMany({ where: { OR: [{ mauticContactId: contactId }, { mauticContactId: null, agendaAfspraak: { mauticContactId: contactId } }] }, include: { agendaAfspraak: { select: { agbegin: true, agend: true, agstatus: true, aginactive: true } }, events: { select: { id: true, eventType: true, createdAt: true, path: true, sessionId: true }, orderBy: { createdAt: "desc" } } }, orderBy: { appointmentStart: "desc" } }),
    prisma.followUpDraft.findMany({ where: { mauticContactId: contactId, sentAt: { not: null } }, select: { id: true, body: true, sentAt: true, waMessageId: true, agendaAfspraakId: true } }),
    prisma.call.findMany({ where: { mauticContactId: contactId }, select: { id: true, timestamp: true, direction: true, status: true, reason: true, notes: { select: { note: true, createdAt: true }, orderBy: { createdAt: "asc" } } } }),
    prisma.mauticEvent.findMany({ where: { mauticContactId: contactId }, select: { id: true, eventType: true, emailName: true, clickedUrl: true, occurredAt: true, rawPayload: true } }),
  ]);
  const conversationIds = confirmations.flatMap(c => c.waConversationId ? [c.waConversationId] : []);
  const messageIds = [...drafts.flatMap(d => d.waMessageId ? [d.waMessageId] : []), ...confirmations.flatMap(c => c.waMessageId ? [c.waMessageId] : [])];
  const messages = await prisma.waMessage.findMany({ where: { OR: [{ conversation: { mauticContactId: contactId } }, { conversation: { id: { in: conversationIds }, mauticContactId: null } }, { id: { in: messageIds }, conversation: { OR: [{ mauticContactId: contactId }, { mauticContactId: null }] } }] }, select: { id: true, body: true, direction: true, createdAt: true, deliveryStatus: true } });
  const items: HistoryItem[] = [];
  for (const a of appointments) if (a.agbegin) items.push({ id: `appointment:${a.id}`, at: a.agbegin.toISOString(), category: "appointments", title: `${a.agtype || "Afspraak"} · ${a.agdescr || ""}`, detail: a.agstatus || undefined, source: "Agenda", appointmentId: a.id });
  const sentMessageIds = new Set(messages.map(m => m.id));
  for (const m of messages) items.push({ id: `whatsapp:${m.id}`, at: m.createdAt.toISOString(), category: "whatsapp", title: `WhatsApp ${m.direction === "OUTBOUND" ? "uitgaand" : "inkomend"}${m.deliveryStatus ? ` · ${m.deliveryStatus}` : ""}`, detail: m.body, source: "WhatsApp" });
  for (const d of drafts) if (d.sentAt && (!d.waMessageId || !sentMessageIds.has(d.waMessageId))) items.push({ id: `draft:${d.id}`, at: d.sentAt.toISOString(), category: "whatsapp", title: "Concept als verzonden geregistreerd", detail: d.body, source: "Digitale medewerker", appointmentId: d.agendaAfspraakId || undefined });
  for (const c of calls) items.push({ id: `call:${c.id}`, at: c.timestamp.toISOString(), category: "calls", title: `${c.direction === "inbound" ? "Inkomend" : "Uitgaand"} telefoongesprek · ${c.reason || c.status}`, detail: c.notes.map(n => `${n.createdAt.toISOString()}\n${n.note}`).join("\n\n") || undefined, source: "Telefonie" });
  const originals = confirmations.flatMap(c => c.events);
  for (const m of mautic) if (!mirroredAppointmentEvent(m, originals)) items.push({ id: `mautic:${m.id}`, at: m.occurredAt.toISOString(), category: "activity", title: m.eventType, detail: [m.emailName, m.clickedUrl].filter(Boolean).join("\n"), source: "Mautic" });
  const cards = confirmations.map(c => {
    const counts: Record<string, Record<string, number>> = { before: {}, during: {}, after: {}, unknown: {} };
    const valid = c.sentAt ? c.events.filter(e => e.createdAt >= c.sentAt!) : [];
    for (const e of valid) {
      const period = appointmentPeriod(c, e.createdAt);
      counts[period][e.eventType] = (counts[period][e.eventType] || 0) + 1;
      items.push({ id: `event:${e.id}`, at: e.createdAt.toISOString(), category: "activity", title: appointmentEventLabels[e.eventType] || e.eventType, detail: c.woningAdres || c.woningTitle || undefined, source: "Afspraakpagina", appointmentId: c.agendaAfspraakId });
    }
    const timing = appointmentTiming(c);
    return { id: c.id, appointmentId: c.agendaAfspraakId, address: c.woningAdres || c.woningTitle || "Bezichtiging", start: timing.start?.toISOString() || null, phase: appointmentPhase(c), status: c.status, sentAt: c.sentAt?.toISOString() || null, publicUrl: c.publicUrl, previewUrl: `/api/agenda/${c.agendaAfspraakId}/appointment-confirmation/preview`, counts, measurementAvailable: Boolean(c.sentAt && valid.length) };
  });
  return NextResponse.json({ appointments: cards, ...historyPage(items, cursor, category) }, { headers: { "Cache-Control": "private, no-store" } });
}
