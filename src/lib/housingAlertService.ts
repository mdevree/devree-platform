import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toWhatsAppJid } from "./phone";
import { sendFollowUpDraft } from "./aiBelassistent";
import { liveAlerts, eligiblePilot } from "./housingAlertClaim";
import { addressKey, parseAlert, renderAlert } from "./housingAlerts";

type Mail = {
  messageId: string;
  receivedAt: string;
  from: string;
  subject: string;
  text: string;
  verified: boolean;
  officeTest?: boolean;
  objectCode?: string;
};
export function isMail(value: Partial<Mail>): value is Mail {
  return (
    (value.from === "no-reply@realworks.nl" ||
      (value.officeTest === true &&
        value.from === "melvin@devreemakelaardij.nl")) &&
    typeof value.messageId === "string" &&
    !!value.messageId.trim() &&
    value.messageId.length <= 998 &&
    typeof value.subject === "string" &&
    value.subject.length <= 500 &&
    typeof value.text === "string" &&
    value.text.length <= 32000 &&
    typeof value.receivedAt === "string" &&
    Number.isFinite(Date.parse(value.receivedAt)) &&
    Date.parse(value.receivedAt) <= Date.now() + 60000
  );
}
export async function receiveHousingMail(mail: Mail) {
  const parsed = parseAlert(mail.subject, mail.text);
  if (
    mail.officeTest &&
    (mail.from !== "melvin@devreemakelaardij.nl" ||
      parsed.addressKey !== "testplaats|kantoortestlaan 25")
  )
    throw new Error("Ongeldige kantoorproef");
  if (!mail.verified)
    parsed.review ||= "Afzender niet bevestigd door de mailserver";
  const receivedAt = new Date(mail.receivedAt);
  const mailKey = createHash("sha256")
    .update(mail.messageId.trim())
    .digest("hex");
  const save = () =>
    prisma.$transaction(
      async (tx) => {
        const existing = await tx.housingAlertEvent.findUnique({
          where: { mailKey },
        });
        if (existing) return existing.id;
        const where = { addressKey: parsed.addressKey, review: null };
        const latest = await tx.housingAlertEvent.findFirst({
          where,
          orderBy: { receivedAt: "desc" },
        });
        const sourceCode =
          typeof mail.objectCode === "string" &&
          /^\d{1,24}$/.test(mail.objectCode)
            ? mail.objectCode
            : null;
        const source = sourceCode
          ? await tx.marketObjectSource.findUnique({
              where: {
                source_sourceObjectId: {
                  source: "realworks",
                  sourceObjectId: sourceCode,
                },
              },
              select: {
                marketObject: {
                  select: {
                    id: true,
                    street: true,
                    houseNumber: true,
                    houseNumberAddition: true,
                    city: true,
                  },
                },
              },
            })
          : null;
        const known = source?.marketObject;
        if (
          known &&
          addressKey(
            [known.street, known.houseNumber, known.houseNumberAddition]
              .filter(Boolean)
              .join(" "),
            known.city || "",
          ) !== parsed.addressKey
        )
          parsed.review ||= "Objectcode en adres verschillen";
        const number = parsed.address.match(/\s+(\d+)(?=[\sA-Za-z/-]*$)/);
        if (number && !known && !parsed.review) {
          const candidates = await tx.marketObject.findMany({
            where: {
              city: parsed.city,
              street: parsed.address.slice(0, number.index),
              houseNumber: number[1],
            },
            select: {
              id: true,
              street: true,
              houseNumber: true,
              houseNumberAddition: true,
              city: true,
            },
          });
          const exact = candidates.filter(
            (c) =>
              addressKey(
                [c.street, c.houseNumber, c.houseNumberAddition]
                  .filter(Boolean)
                  .join(" "),
                c.city || "",
              ) === parsed.addressKey,
          );
          if (exact.length > 1 || (!exact.length && candidates.length))
            parsed.review = "Huisnummer of toevoeging niet eenduidig";
        }
        if (
          parsed.status === "sold" &&
          latest?.status === "sold" &&
          latest.transactionPrice !== parsed.transactionPrice
        )
          parsed.review ||=
            "Verkoopprijs wijkt af van de eerdere verkoopmelding";
        if (latest && latest.receivedAt > receivedAt)
          parsed.review ||= "Oudere melding na een recentere wijziging";
        const event = await tx.housingAlertEvent.create({
          data: {
            ...parsed,
            address: parsed.address.slice(0, 191),
            city: parsed.city.slice(0, 191),
            addressKey: parsed.addressKey.slice(0, 191),
            sourceCode,
            mailKey,
            receivedAt,
          },
        });
        if (event.review) return event.id;
        const earlier = {
          ...where,
          ...(sourceCode ? { sourceCode } : {}),
          id: { not: event.id },
          receivedAt: { lte: receivedAt },
        };
        const lastStatus = await tx.housingAlertEvent.findFirst({
          where: { ...earlier, status: { not: null } },
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        });
        const lastPrice = await tx.housingAlertEvent.findFirst({
          where: { ...earlier, askingPrice: { not: null } },
          orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        });
        const rules = await tx.housingAlertRule.findMany({
          where: {
            addressKey: event.addressKey,
            state: "active",
            activeFrom: { lte: receivedAt },
          },
        });
        for (const rule of rules) {
          if (rule.addressKey !== parsed.addressKey) continue;
          const newListing =
            !!sourceCode &&
            !!latest?.sourceCode &&
            latest.sourceCode !== sourceCode;
          const previousPrice = newListing
            ? null
            : lastPrice && lastPrice.receivedAt >= rule.activeFrom
              ? lastPrice.askingPrice
              : (rule.initialPrice ?? lastPrice?.askingPrice ?? null);
          const changed =
            rule.kind === "price"
              ? !!event.askingPrice &&
                !!previousPrice &&
                previousPrice !== event.askingPrice
              : rule.kind === event.status &&
                lastStatus?.status !== event.status;
          if (known && rule.marketObjectId && rule.marketObjectId !== known.id)
            continue;
          if (!changed || (mail.officeTest && !eligiblePilot(rule.phone)))
            continue;
          let body: string;
          try {
            body = renderAlert(rule.template, {
              voornaam: rule.firstName,
              adres: event.address,
              plaats: event.city,
              vraagprijs: event.askingPrice,
              vorigevraagprijs: previousPrice,
              transactieprijs: event.transactionPrice,
            });
          } catch (err) {
            await tx.housingAlertDelivery.create({
              data: {
                eventId: event.id,
                ruleId: rule.id,
                state: "review",
                body: String(err),
              },
            });
            continue;
          }
          if (!rule.phone || !toWhatsAppJid(rule.phone)) {
            await tx.housingAlertDelivery.create({
              data: {
                eventId: event.id,
                ruleId: rule.id,
                state: "review",
                body: "Geen bruikbaar WhatsApp-nummer. " + body,
              },
            });
            continue;
          }
          const preview =
            !liveAlerts() && !(mail.officeTest && eligiblePilot(rule.phone));
          const draft = preview
            ? null
            : await tx.followUpDraft.create({
                data: {
                  channel: "whatsapp",
                  purpose: "woningmelding",
                  mauticContactId: rule.contactId,
                  recipientName: rule.recipientName,
                  recipientPhone: rule.phone,
                  body,
                  createdBy: "woningmeldingen",
                },
              });
          await tx.housingAlertDelivery.create({
            data: {
              eventId: event.id,
              ruleId: rule.id,
              state: preview ? "preview" : "ready",
              body,
              draftId: draft?.id,
            },
          });
        }
        return event.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
    );
  let eventId: string;
  for (let attempt = 1; ; attempt++) {
    try {
      eventId = await save();
      break;
    } catch (e) {
      if (
        attempt === 4 ||
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2002", "P2034"].includes(e.code)
      )
        throw e;
    }
  }
  const pending = await prisma.housingAlertDelivery.findMany({
    where: { eventId, state: "ready", rule: { mode: "auto", state: "active" } },
  });
  for (const row of pending)
    if (row.draftId) await sendFollowUpDraft(row.draftId, "Woningmeldingen");
  return prisma.housingAlertEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { deliveries: { select: { state: true } } },
  });
}
