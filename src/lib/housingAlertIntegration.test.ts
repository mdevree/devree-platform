import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { templates, addressKey, type AlertKind } from "./housingAlerts";
import { prisma } from "./prisma";
import { receiveHousingMail } from "./housingAlertService";
import { PATCH } from "../app/api/woningmeldingen/route";

test(
  "woningmeldingen met MariaDB: gelijktijdig ontvangen, afhandelen, status en prijs",
  { skip: !process.env.HOUSING_ALERT_DB_TEST },
  async () => {
    assert.match(
      new URL(process.env.DATABASE_URL!).pathname,
      /^\/woningmeldingen_test_[a-f0-9]+$/,
    );
    process.env.HOUSING_ALERT_MODE = "preview";
    delete process.env.HOUSING_ALERT_TEST_PHONE;
    process.env.N8N_WEBHOOK_SECRET = "isolated-test";
    const base = new Date("2026-08-01T00:00:00Z");
    async function rule(address: string, city: string, kind: AlertKind) {
      return prisma.housingAlertRule.create({
        data: {
          contactId: 1,
          firstName: "Charlotte",
          recipientName: "Testcontact",
          phone: "+31600000000",
          address,
          city,
          addressKey: addressKey(address, city),
          kind,
          mode: "auto",
          template: templates[kind],
          activeFrom: base,
        },
      });
    }
    function mail(
      id: string,
      address: string,
      city: string,
      body: string,
      date: string,
    ) {
      return {
        messageId: id,
        from: "no-reply@realworks.nl",
        verified: true,
        receivedAt: date,
        subject:
          "Notificatie voor uitwisseling object: " + address + " te " + city,
        text:
          "Bij " +
          address +
          " te " +
          city +
          " is de volgende wijziging doorgevoerd: " +
          body,
      };
    }
    const dorade = await rule("Doradehof 47", "Hoogvliet Rotterdam", "sold");
    const sold = mail(
      "sale",
      dorade.address,
      dorade.city,
      "Dit object is nu Verkocht met Transactieprijs: € 377.500,- en datum transport 04-01-2027.",
      "2026-11-25T13:33:24Z",
    );
    const [a, b] = await Promise.all([
      receiveHousingMail(sold),
      receiveHousingMail(sold),
    ]);
    assert.equal(a.id, b.id);
    const match = await prisma.housingAlertDelivery.findFirstOrThrow({
      where: { ruleId: dorade.id },
    });
    assert.equal(match.state, "preview");
    assert.match(match.body, /€ 377.500/);
    assert.equal(match.draftId, null);
    const result = await PATCH(
      new NextRequest("http://localhost/api/woningmeldingen", {
        method: "PATCH",
        headers: { "x-webhook-secret": "isolated-test" },
        body: JSON.stringify({ id: match.id, action: "handled" }),
      }),
    );
    assert.equal(result.status, 200);
    await receiveHousingMail({ ...sold, messageId: "another copy" });
    assert.equal(
      await prisma.housingAlertDelivery.count({ where: { ruleId: dorade.id } }),
      1,
    );
    assert.equal(
      (
        await prisma.housingAlertRule.findUniqueOrThrow({
          where: { id: dorade.id },
        })
      ).state,
      "completed",
    );
    const address = "Cremerstraat 125",
      city = "Pernis Rotterdam";
    for (const kind of ["bid", "available", "price"] as const)
      await rule(address, city, kind);
    const bid = mail(
      "bid",
      address,
      city,
      "Dit object is nu Onder bod. Dit object is nu in de verkoop met Vraagprijs: € 359.000,- kosten koper.",
      "2026-11-12T15:17:30Z",
    );
    const avail = {
      ...bid,
      messageId: "available",
      text: bid.text.replace("Onder bod", "Beschikbaar"),
      receivedAt: "2026-11-25T08:18:42Z",
    };
    assert.equal((await receiveHousingMail(bid)).deliveries.length, 1);
    assert.equal((await receiveHousingMail(avail)).deliveries.length, 1);
    const price = await receiveHousingMail({
      ...avail,
      messageId: "price",
      receivedAt: "2026-11-25T09:00:00Z",
      text: avail.text.replace("359.000", "349.000"),
    });
    assert.equal(price.deliveries.length, 1);
    const changed = await prisma.housingAlertDelivery.findFirstOrThrow({
      where: { eventId: price.id },
    });
    assert.match(changed.body, /359.000 naar € 349.000/);
    assert.ok((await receiveHousingMail({ ...bid, messageId: "late" })).review);
    assert.equal(await prisma.followUpDraft.count(), 0);
    await prisma.$disconnect();
  },
);
