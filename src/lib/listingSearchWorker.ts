import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { liveAlerts } from "./housingAlertClaim";
import { postcodePoint } from "./listingGeography";
import { withinRadius, reviewEmail } from "./listingSearch";
import { renderAlert } from "./housingAlerts";
import { toWhatsAppJid } from "./phone";

type Job = Prisma.ListingSearchJobGetPayload<{
  include: { rule: true; mutation: true };
}>;
const smtp = nodemailer.createTransport({
  host: "127.0.0.1",
  port: 25,
  ignoreTLS: true,
  connectionTimeout: 5000,
  socketTimeout: 15000,
});

async function prepare(job: Job, claim: string) {
  const { rule, mutation } = job;
  const address = [mutation.street, mutation.houseNumber]
    .filter(Boolean)
    .join(" ");
  const point = await postcodePoint(
    mutation.postcode || "",
    mutation.city || "",
  );
  const outside =
    point &&
    rule.centerX != null &&
    rule.centerY != null &&
    rule.radiusMeters != null &&
    !withinRadius(
      { x: rule.centerX, y: rule.centerY },
      point,
      rule.radiusMeters,
    );
  let problem = "";
  let body = "";
  if (!point)
    problem = "Controleer de afstand. De postcode is onbekend bij PDOK.";
  else if (!address) problem = "Het adres ontbreekt in de aanmelding.";
  else if (!toWhatsAppJid(rule.phone || ""))
    problem = "Controleer het WhatsApp-nummer.";
  else {
    try {
      body = renderAlert(rule.template, {
        voornaam: rule.firstName,
        adres: address,
        plaats: mutation.city || rule.city,
        vraagprijs: mutation.askingPrice,
        vorigevraagprijs: null,
        transactieprijs: null,
      });
    } catch (error) {
      problem = String(error);
    }
  }
  await prisma.$transaction(async (tx) => {
    const ownership = await tx.listingSearchJob.updateMany({
      where: { id: job.id, claim, stage: "match" },
      data: { stage: "done", claim: null },
    });
    if (!ownership.count || outside) return;
    const active = await tx.housingAlertRule.findFirst({
      where: {
        id: rule.id,
        state: "active",
        activeFrom: rule.activeFrom,
        mode: "draft",
      },
    });
    if (
      !active ||
      active.activeFrom >
        (mutation.sourceDate ?? mutation.mutationDate ?? mutation.receivedAt) ||
      active.activeFrom > mutation.receivedAt
    )
      return;
    const closed = await tx.realworksObjectMutation.findFirst({
      where: {
        exchangeObjectId: job.exchangeObjectId,
        mutationType: { in: ["removed", "withdrawn"] },
        receivedAt: { gte: mutation.receivedAt },
      },
    });
    if (closed) return;
    const key = "listing:" + job.exchangeObjectId;
    const event = await tx.housingAlertEvent.upsert({
      where: { mailKey: key },
      update: {},
      create: {
        mailKey: key,
        sourceCode: job.exchangeObjectId,
        addressKey: key,
        address: address.slice(0, 191),
        city: rule.city,
        status: "listing",
        askingPrice: mutation.askingPrice,
        receivedAt: mutation.receivedAt,
      },
    });
    const draft =
      !problem && liveAlerts()
        ? await tx.followUpDraft.create({
            data: {
              purpose: "zoekmelding",
              channel: "whatsapp",
              status: "draft",
              body,
              mauticContactId: rule.contactId,
              recipientName: rule.recipientName,
              recipientPhone: rule.phone,
              createdBy: "woningmeldingen",
            },
          })
        : null;
    await tx.housingAlertDelivery.create({
      data: {
        eventId: event.id,
        ruleId: rule.id,
        draftId: draft?.id,
        state: problem ? "review" : draft ? "ready" : "preview",
        body: problem || body,
      },
    });
    if (draft)
      await tx.listingSearchJob.update({
        where: { id: job.id },
        data: {
          draftId: draft.id,
          stage: "email",
          nextAttempt: new Date(),
          error: null,
        },
      });
  });
}

type SendOfficeMail = (mail: nodemailer.SendMailOptions) => Promise<unknown>;

async function notify(job: Job, sendMail: SendOfficeMail) {
  if (!job.draftId || !liveAlerts()) return;
  const delivery = await prisma.housingAlertDelivery.findFirst({
    where: {
      draftId: job.draftId,
      state: "ready",
      rule: { state: "active", activeFrom: { lte: job.mutation.receivedAt } },
      draft: { status: { in: ["draft", "approved"] } },
    },
    include: { draft: true, event: true },
  });
  if (!delivery?.draft) return;
  const url = new URL(
    "/digitale-medewerker",
    process.env.PLATFORM_BASE_URL || "https://kantoor.devreemakelaardij.nl",
  );
  url.searchParams.set("tab", "concepten");
  url.searchParams.set("draft", job.draftId);
  url.hash = "concept-" + job.draftId;
  await sendMail({
    from: "De Vree Makelaardij <info@devreemakelaardij.nl>",
    to: reviewEmail,
    messageId: "<zoekmelding-" + job.id + "@devreemakelaardij.nl>",
    subject: "Goedkeuring nodig voor WhatsApp over " + delivery.event.address,
    text: [
      "Hoi Melvin,",
      "",
      delivery.event.address +
        " in " +
        delivery.event.city +
        " past bij de zoekwens van " +
        job.rule.recipientName +
        ".",
      "Zoekwens: " + job.rule.address,
      "Realworks: " + job.mutation.moveUrl,
      "",
      "WhatsApp-concept:",
      delivery.draft.body,
      "",
      "Open het concept om de tekst te controleren. Met ‘Goedkeuren en verzenden’ verstuur je de WhatsApp.",
      url.toString(),
    ].join("\n"),
  });
}

export async function processListingSearchJobs(
  sendMail: SendOfficeMail = (mail) => smtp.sendMail(mail),
) {
  const jobs = await prisma.listingSearchJob.findMany({
    where: {
      stage: { in: ["match", "email"] },
      nextAttempt: { lte: new Date() },
    },
    include: { rule: true, mutation: true },
    orderBy: { nextAttempt: "asc" },
    take: 25,
  });
  for (const job of jobs) {
    const claim = randomUUID();
    const acquired = await prisma.listingSearchJob.updateMany({
      where: {
        id: job.id,
        stage: job.stage,
        nextAttempt: { lte: new Date() },
      },
      data: { claim, nextAttempt: new Date(Date.now() + 120000) },
    });
    if (!acquired.count) continue;
    try {
      if (job.stage === "match") await prepare(job, claim);
      else {
        await notify(job, sendMail);
        await prisma.listingSearchJob.updateMany({
          where: { id: job.id, claim },
          data: {
            stage: "done",
            claim: null,
            error: null,
          },
        });
      }
    } catch (error) {
      await prisma.listingSearchJob.updateMany({
        where: { id: job.id, claim },
        data: {
          claim: null,
          error: String(error).slice(0, 191),
          nextAttempt: new Date(Date.now() + 60000),
        },
      });
      console.error("Verwerking zoekmelding wordt herhaald", job.id, job.stage);
    }
  }
}

export function startListingSearchWorker() {
  async function run() {
    try {
      await processListingSearchJobs();
    } catch {
      console.error("Wachtrij zoekmeldingen tijdelijk onbereikbaar");
    } finally {
      setTimeout(run, 10000).unref();
    }
  }
  void run();
}
