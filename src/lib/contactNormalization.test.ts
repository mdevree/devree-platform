import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMauticContactToContactV1 } from "./contactNormalization";

const BASE = {
  id: 100,
  firstname: "Anne Marie",
  lastname: "de Vries",
  email: " anne@example.invalid ",
  mobile: " 0612345678 ",
  phone: null,
  city: " Rotterdam ",
  country: "nl",
};

test("gebruikt expliciet huisnummer 12 en toevoeging als eerste bron", () => {
  const contact = normalizeMauticContactToContactV1({
    ...BASE,
    address1: "Dorpsstraat",
    zipcode: "1234ab",
    huisnummer: "12",
    huisnummer_toevoeging: "A",
  });

  assert.equal(contact.straat, "Dorpsstraat");
  assert.equal(contact.huisnummer, "12");
  assert.equal(contact.toevoeging, "A");
  assert.equal(contact.postcode, "1234 AB");
  assert.equal(contact.land, "Nederland");
  assert.deepEqual(contact.normalizationWarnings, []);
});

test("parseert 12A uit samengesteld address1", () => {
  const contact = normalizeMauticContactToContactV1({ ...BASE, address1: "Dorpsstraat 12A" });

  assert.equal(contact.straat, "Dorpsstraat");
  assert.equal(contact.huisnummer, "12");
  assert.equal(contact.toevoeging, "A");
  assert.equal(contact.normalizationWarnings[0]?.code, "parsed_address1");
});

test("parseert 12-1 uit samengesteld address1", () => {
  const contact = normalizeMauticContactToContactV1({ ...BASE, address1: "Dorpsstraat 12-1" });

  assert.equal(contact.huisnummer, "12");
  assert.equal(contact.toevoeging, "-1");
});

test("parseert 12 bis uit samengesteld address1", () => {
  const contact = normalizeMauticContactToContactV1({ ...BASE, address1: "Dorpsstraat 12 bis" });

  assert.equal(contact.huisnummer, "12");
  assert.equal(contact.toevoeging, "bis");
});

test("behoudt straatnamen met cijfers", () => {
  const contact = normalizeMauticContactToContactV1({ ...BASE, address1: "2e Middellandstraat 12A" });

  assert.equal(contact.straat, "2e Middellandstraat");
  assert.equal(contact.huisnummer, "12");
  assert.equal(contact.toevoeging, "A");
});

test("raadt bij postbus geen huisnummer", () => {
  const contact = normalizeMauticContactToContactV1({ ...BASE, address1: "Postbus 123" });

  assert.equal(contact.straat, "Postbus 123");
  assert.equal(contact.huisnummer, null);
  assert.ok(contact.normalizationWarnings.some((warning) => warning.code === "unparseable_address"));
});

test("laat buitenlandse postcode landafhankelijk en meldt waarschuwing", () => {
  const contact = normalizeMauticContactToContactV1({
    ...BASE,
    address1: "Rue Exemple 4",
    zipcode: "75001",
    city: "Paris",
    country: "Frankrijk",
  });

  assert.equal(contact.postcode, "75001");
  assert.equal(contact.land, "Frankrijk");
  assert.ok(contact.normalizationWarnings.some((warning) => warning.code === "foreign_postcode"));
});

test("geeft waarschuwing bij onparseerbaar adres", () => {
  const contact = normalizeMauticContactToContactV1({ ...BASE, address1: "Adres zonder nummer" });

  assert.equal(contact.straat, "Adres zonder nummer");
  assert.equal(contact.huisnummer, null);
  assert.ok(contact.normalizationWarnings.some((warning) => warning.code === "unparseable_address"));
});

test("negeert address2 als dit postcode en plaats dupliceert", () => {
  const contact = normalizeMauticContactToContactV1({
    ...BASE,
    address1: "Dorpsstraat 12",
    address2: "1234 AB Rotterdam",
    zipcode: "1234AB",
  });

  assert.equal(contact.aanvullendeAdresregel, null);
  assert.ok(contact.normalizationWarnings.some((warning) => warning.code === "duplicate_address2"));
});
