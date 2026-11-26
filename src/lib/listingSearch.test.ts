import assert from "node:assert/strict";
import test from "node:test";
import { listingType, reviewEmail, withinRadius } from "./listingSearch";
import { prisma } from "./prisma";
import { queueListingMatches } from "./listingSearchQueue";
import { processListingSearchJobs } from "./listingSearchWorker";
import { sendFollowUpDraft } from "./aiBelassistent";
import { templates } from "./housingAlerts";
import type { SendMailOptions } from "nodemailer";

test("garagebox is zelfstandig aanbod en gebruikt een inclusieve straal", () => {
  assert.equal(listingType("OverigOG", "garagebox"), "garage");
  assert.equal(listingType("Woonhuis", "garagebox"), "house");
  assert.equal(listingType("OverigOG", "parkeerplaats"), "parking");
  assert.equal(listingType("OverigOG", "berging"), null);
  assert.equal(withinRadius({ x: 0, y: 0 }, { x: 300, y: 400 }, 500), true);
  assert.equal(withinRadius({ x: 0, y: 0 }, { x: 300, y: 400 }, 499), false);
});

test(
  "nieuwe garage leidt tot één concept en één goedkeuringsmail bij dubbele aanlevering",
  {
    skip: !process.env.LISTING_SEARCH_DB_TEST,
  },
  async (t) => {
    assert.match(
      new URL(process.env.DATABASE_URL!).pathname,
      /^\/woningmeldingen_test_[a-f0-9]+$/,
    );
    process.env.HOUSING_ALERT_MODE = "live";
    const from = new Date("2026-11-25T09:00:00Z");
    const receivedAt = new Date("2026-11-26T06:20:00Z");
    const stamp = Date.now().toString();
    const rule = await prisma.housingAlertRule.create({
      data: {
        contactId: 42,
        firstName: "Test",
        recipientName: "Testcontact",
        phone: "0612345678",
        addressKey: stamp,
        city: "Spijkenisse",
        address: "Garage · Waterland · 1 km",
        kind: "listing",
        template: templates.listing,
        searchType: "garage",
        area: "Waterland",
        activeFrom: from,
        centerX: 83008,
        centerY: 427751,
        radiusMeters: 1000,
      },
    });
    t.after(async () => {
      await prisma.housingAlertRule.update({
        where: { id: rule.id },
        data: { state: "paused" },
      });
      await prisma.$disconnect();
    });
    const mail: SendMailOptions[] = [];
    const send = async (message: SendMailOptions) => {
      mail.push(message);
    };
    t.mock.method(globalThis, "fetch", async (url: URL) => {
      const pc = url.searchParams.get("q");
      return Response.json({
        response: {
          docs: [
            {
              postcode: pc,
              woonplaatsnaam: "Spijkenisse",
              centroide_rd:
                pc === "3205AE" ? "POINT(82434 428167)" : "POINT(80500 431000)",
            },
          ],
        },
      });
    });
    async function enqueue(key: string, changes = {}) {
      const row = await prisma.realworksObjectMutation.create({
        data: {
          exchangeObjectId: stamp + key,
          sourceMessageId: crypto.randomUUID(),
          mutationType: "new",
          mutationLabel: "Aangemeld",
          street: "Beverveen",
          houseNumber: "25",
          postcode: "3205 AE",
          city: "Spijkenisse",
          objectKind: "OverigOG",
          objectSubType: "garagebox",
          rawText: "",
          moveUrl: "https://move.nl/example",
          receivedAt,
          sourceDate: receivedAt,
          ...changes,
        },
      });
      await prisma.$transaction((tx) => queueListingMatches(tx, row));
    }
    await enqueue("garage");
    await enqueue("garage");
    await enqueue("oud", { sourceDate: new Date("2026-11-24") });
    await enqueue("prijs", { mutationType: "price_changed" });
    await enqueue("huis", { objectKind: "Woonhuis" });
    await enqueue("ver", { postcode: "3202 GL" });
    await enqueue("plaats", { city: "Rozenburg" });
    assert.equal(
      await prisma.listingSearchJob.count({ where: { ruleId: rule.id } }),
      2,
    );
    await Promise.all([
      processListingSearchJobs(send),
      processListingSearchJobs(send),
    ]);
    await processListingSearchJobs(send);
    await processListingSearchJobs(send);
    const deliveries = await prisma.housingAlertDelivery.findMany({
      where: { ruleId: rule.id },
      include: { draft: true },
    });
    assert.equal(deliveries.length, 1);
    const draft = deliveries[0].draft!;
    assert.equal(draft.status, "draft");
    assert.equal(draft.sentAt, null);
    assert.match(draft.body, /Beverveen 25 in Spijkenisse/);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, reviewEmail);
    assert.ok(String(mail[0].text).includes("draft=" + draft.id));
    await assert.rejects(
      sendFollowUpDraft(draft.id, null, reviewEmail),
      /goedkeuren/,
    );
    await prisma.followUpDraft.update({
      where: { id: draft.id },
      data: { status: "approved" },
    });
    await assert.rejects(
      sendFollowUpDraft(draft.id, "Woningmeldingen"),
      /goedkeuren/,
    );
  },
);
