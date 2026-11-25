import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { toWhatsAppJid } from "@/lib/phone";
import { getContact } from "@/lib/mautic";
import { liveAlerts } from "@/lib/housingAlertClaim";
import {
  addressKey,
  isKind,
  previewAlert,
  usableAddress,
} from "@/lib/housingAlerts";

const error = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });
const denied = () => error("Geen toegang", 401);
const objectFields = {
  id: true,
  street: true,
  houseNumber: true,
  houseNumberAddition: true,
  city: true,
  askingPrice: true,
} as const;
const formatAddress = (o: {
  street: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
}) =>
  [o.street, o.houseNumber, o.houseNumberAddition].filter(Boolean).join(" ");

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return denied();
  const params = req.nextUrl.searchParams;
  if (params.has("q")) {
    const q = (params.get("q") || "").trim().slice(0, 160);
    if (q.length < 2) return NextResponse.json([]);
    const street = q.split(/\s+\d/)[0];
    const objects = await prisma.marketObject.findMany({
      where: {
        street: { startsWith: street },
        ...(/\s(\d+)/.test(q) ? { houseNumber: q.match(/\s(\d+)/)![1] } : {}),
      },
      select: objectFields,
      take: 25,
      orderBy: { lastSeenAt: "desc" },
    });
    return NextResponse.json(
      objects.map((o) => ({
        id: o.id,
        address: formatAddress(o),
        city: o.city,
      })),
    );
  }
  const contactId = Number(params.get("contactId"));
  if (
    params.has("contactId") &&
    !(Number.isSafeInteger(contactId) && contactId > 0)
  )
    return error("Ongeldig contact");
  const skip = Math.max(0, Number(params.get("page")) || 0) * 50;
  if (!Number.isSafeInteger(skip)) return error("Ongeldige pagina");
  const [rules, events, last] = await Promise.all([
    prisma.housingAlertRule.findMany({
      where: contactId ? { contactId } : {},
      orderBy: { createdAt: "desc" },
      skip,
      take: 50,
    }),
    contactId
      ? []
      : prisma.housingAlertEvent.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: 50,
          include: {
            deliveries: {
              include: {
                rule: { select: { recipientName: true, kind: true } },
                draft: {
                  select: { status: true, body: true, deliveryError: true },
                },
              },
            },
          },
        }),
    prisma.housingAlertEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  return NextResponse.json({
    rules,
    events,
    last: last?.createdAt,
    live: liveAlerts(),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return denied();
  const b = await req.json().catch(() => null);
  if (
    !b ||
    !Number.isSafeInteger(b.contactId) ||
    b.contactId < 1 ||
    !isKind(b.kind) ||
    !["auto", "draft"].includes(b.mode) ||
    typeof b.template !== "string" ||
    !b.template.trim() ||
    b.template.length > 2000
  )
    return error("Controleer de regel en berichttekst");
  const contact = await getContact(b.contactId);
  if (!contact) return error("Contact niet gevonden", 404);
  const object = b.marketObjectId
    ? await prisma.marketObject.findUnique({
        where: { id: String(b.marketObjectId) },
        select: objectFields,
      })
    : null;
  if (b.marketObjectId && !object) return error("Woning niet gevonden");
  const address = (
    object ? formatAddress(object) : String(b.address || "")
  ).trim();
  const city = (object ? object.city || "" : String(b.city || "")).trim();
  const key = addressKey(address, city);
  if (!usableAddress(address, city) || key.length > 191)
    return error("Vul straat, huisnummer, eventuele toevoeging en plaats in");
  const firstName = contact.firstname || "";
  try {
    previewAlert(b.template, firstName, address, city);
  } catch (e) {
    return error(String(e));
  }
  try {
    const rule = await prisma.housingAlertRule.create({
      data: {
        contactId: contact.id,
        firstName,
        recipientName: [firstName, contact.lastname].filter(Boolean).join(" "),
        phone: contact.mobile || contact.phone,
        address,
        city,
        addressKey: key,
        marketObjectId: object?.id,
        initialPrice: object?.askingPrice,
        kind: b.kind,
        mode: b.mode,
        template: b.template.trim(),
        note: String(b.note || "")
          .trim()
          .slice(0, 2000),
      },
    });
    return NextResponse.json({ id: rule.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return error(
        "Voor deze klant, woning en aanleiding bestaat al een regel",
        409,
      );
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req))) return denied();
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string") return error("Ongeldige actie");
  if (b.action === "pause" || b.action === "resume") {
    const pause = b.action === "pause";
    const r = await prisma.housingAlertRule.updateMany({
      where: { id: b.id, state: pause ? "active" : "paused" },
      data: pause
        ? { state: "paused" }
        : { state: "active", activeFrom: new Date(), initialPrice: null },
    });
    return r.count
      ? NextResponse.json({ ok: true })
      : error("Regel is al gewijzigd", 409);
  }
  if (b.action === "reconcile") {
    const row = await prisma.housingAlertDelivery.findUnique({
      where: { id: b.id },
      include: { rule: true, draft: true },
    });
    if (
      !row?.draft ||
      !row.attemptedAt ||
      !["sending", "uncertain"].includes(row.state)
    )
      return error("Geen openstaande verzendpoging", 409);
    const jid = toWhatsAppJid(row.draft.recipientPhone || "");
    if (!jid) return error("Nummer ontbreekt");
    const messages = await prisma.waMessage.findMany({
      where: {
        conversation: { waPhone: jid },
        direction: "OUTBOUND",
        body: row.draft.body,
        evolutionMsgId: { not: null },
        createdAt: {
          gte: row.attemptedAt,
          lte: new Date(row.attemptedAt.getTime() + 60000),
        },
      },
      take: 2,
    });
    if (messages.length !== 1)
      return error(
        "Geen eenduidige verzendbevestiging gevonden. Controleer het WhatsApp-gesprek.",
        409,
      );
    const m = messages[0];
    await prisma.$transaction(async (tx) => {
      const claim = await tx.housingAlertDelivery.updateMany({
        where: { id: row.id, state: { in: ["sending", "uncertain"] } },
        data: { state: "sent" },
      });
      if (!claim.count) return;
      await tx.followUpDraft.update({
        where: { id: row.draft!.id },
        data: {
          status: "sent",
          sentAt: m.createdAt,
          waMessageId: m.id,
          waConversationId: m.conversationId,
          deliveryError: null,
        },
      });
      if (row.rule.kind === "sold")
        await tx.housingAlertRule.update({
          where: { id: row.ruleId },
          data: { state: "completed" },
        });
    });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "handled") {
    const ok = await prisma.$transaction(async (tx) => {
      const row = await tx.housingAlertDelivery.findUnique({
        where: { id: b.id },
        include: { rule: true },
      });
      if (!row) return false;
      const r = await tx.housingAlertDelivery.updateMany({
        where: {
          id: b.id,
          state: { in: ["ready", "preview", "review", "uncertain"] },
        },
        data: { state: "handled" },
      });
      if (!r.count) return false;
      if (row.draftId)
        await tx.followUpDraft.updateMany({
          where: { id: row.draftId, sentAt: null },
          data: { status: "rejected", reviewedBy: "Al zelf doorgegeven" },
        });
      if (row.rule.kind === "sold")
        await tx.housingAlertRule.update({
          where: { id: row.ruleId },
          data: { state: "completed" },
        });
      return true;
    });
    return ok
      ? NextResponse.json({ ok: true })
      : error("Melding is al verwerkt of wordt verstuurd", 409);
  }
  return error("Onbekende actie");
}
