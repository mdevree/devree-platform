import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  addressKey,
  parseAlert,
  renderAlert,
  templates,
} from "./housingAlerts";

const subject =
  "Notificatie voor uitwisseling object: Doradehof 47 te Hoogvliet Rotterdam";
const intro =
  "Geachte heer De Vree, Bij Doradehof 47 te Hoogvliet Rotterdam is de volgende wijziging doorgevoerd: ";
test("Doradehof geeft de expliciete transactieprijs en een persoonlijk bericht", () => {
  const e = parseAlert(
    subject,
    intro +
      "Dit object is nu Verkocht met Transactieprijs: € 377.500,- en datum transport 04-01-2027.",
  );
  assert.equal(e.status, "sold");
  assert.equal(e.transactionPrice, 377500);
  assert.equal(e.review, null);
  assert.match(
    renderAlert(templates.sold, {
      adres: e.address,
      voornaam: "Charlotte",
      plaats: e.city,
      vraagprijs: null,
      vorigevraagprijs: null,
      transactieprijs: e.transactionPrice,
    }),
    /Doradehof 47 is verkocht voor € 377.500/,
  );
});
test("Cremerstraat onder bod en weer beschikbaar hebben dezelfde vraagprijs", () => {
  for (const [state, expected] of [
    ["Onder bod", "bid"],
    ["Beschikbaar", "available"],
    ["Verkocht onder voorbehoud", "conditional"],
  ]) {
    const e = parseAlert(
      subject,
      intro +
        "Dit object is nu " +
        state +
        ". Dit object is nu in de verkoop met Vraagprijs: € 359.000,- kosten koper.",
    );
    assert.equal(e.status, expected);
    assert.equal(e.askingPrice, 359000);
    assert.equal(e.transactionPrice, null);
  }
});
test("onbekende bedragen, ontbrekende transactieprijs en een afwijkende toevoeging vragen controle", () => {
  for (const price of [
    "Vraagprijs: € 395.000,-",
    "Transactieprijs: op aanvraag",
    "Transactieprijs: € 377.50",
  ]) {
    const e = parseAlert(
      subject,
      intro + "Dit object is nu Verkocht met " + price,
    );
    assert.ok(e.review);
    assert.equal(e.transactionPrice, null);
  }
  assert.ok(
    parseAlert(
      subject,
      intro.replace("47 te", "47 A te") + "Dit object is nu Onder bod.",
    ).review,
  );
  assert.notEqual(
    addressKey("Doradehof 47 A", "Rotterdam"),
    addressKey("Doradehof 47", "Rotterdam"),
  );
});
test("n8n herkent de twee invoerroutes, bewaart mail-ID en selecteert alleen de bedoelde mailbox", () => {
  const processItems = new Function(
    "$input",
    readFileSync("n8n/lib/housing-notification.code", "utf8"),
  );
  const record = {
    from: "Realworks <no-reply@realworks.nl>",
    to: "melvin@devreemakelaardij.nl",
    date: "2026-11-25T13:33:24Z",
    subject,
    textHtml: "<p>Test &euro; 377.500</p>",
    metadata: {
      "message-id": "<fixture>",
      "x-spam-report": 'system "server2.devreewebdevelopment.nl" DKIM_VALID_AU',
    },
  };
  const apply = (json: typeof record) =>
    processItems({ all: () => [{ json }] });
  assert.deepEqual(apply({ ...record, to: "iemand@example.nl" }), []);
  assert.deepEqual(apply({ ...record, from: "iemand@example.nl" }), []);
  const mail = apply(record)[0].json;
  assert.equal(mail.verified, true);
  assert.equal(mail.messageId, "<fixture>");
  assert.equal(mail.text, "Test € 377.500");
  assert.equal(
    apply({
      ...record,
      metadata: { ...record.metadata, "x-spam-report": "" },
    })[0].json.verified,
    false,
  );
});
