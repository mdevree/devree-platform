import assert from "node:assert/strict";
import test from "node:test";

import { mapMauticContactFull } from "./mautic";

test("mapt Mautic facturatievelden naar volledig contact en ContactV1", () => {
  const contact = mapMauticContactFull({
    id: 123,
    points: 10,
    dateAdded: "2026-07-21T10:00:00+00:00",
    tags: [{ tag: "facturatie" }],
    fields: {
      all: {
        firstname: "Anne Marie",
        lastname: "de Vries",
        email: "anne@example.invalid",
        mobile: "0612345678",
        phone: "0101234567",
        address1: "Dorpsstraat",
        address2: "1234 AB Rotterdam",
        zipcode: "1234AB",
        city: "Rotterdam",
        country: "Nederland",
        huisnummer: "12",
        huisnummer_toevoeging: "A",
        otd_aanhef: "Mevrouw",
        otd_initialen: "A.M.",
        otd_voornamen: "Anne Marie",
        otd_geboortedatum: "1980-01-01",
      },
    },
  });

  assert.equal(contact.huisnummer, "12");
  assert.equal(contact.huisnummerToevoeging, "A");
  assert.equal(contact.otdAanhef, "Mevrouw");
  assert.equal(contact.otdInitialen, "A.M.");
  assert.equal(contact.otdVoornamen, "Anne Marie");
  assert.equal(contact.geboortedatum, "1980-01-01");
  assert.equal(contact.contactV1.mauticContactId, 123);
  assert.equal(contact.contactV1.aanhef, "Mevrouw");
  assert.equal(contact.contactV1.initialen, "A.M.");
  assert.equal(contact.contactV1.voornamen, "Anne Marie");
  assert.equal(contact.contactV1.tussenvoegsel, "de");
  assert.equal(contact.contactV1.achternaam, "Vries");
  assert.equal(contact.contactV1.straat, "Dorpsstraat");
  assert.equal(contact.contactV1.huisnummer, "12");
  assert.equal(contact.contactV1.toevoeging, "A");
  assert.equal(contact.contactV1.aanvullendeAdresregel, null);
  assert.ok(contact.contactV1.normalizationWarnings.some((warning) => warning.code === "duplicate_address2"));
});

test("ontbrekende Mautic custom fields worden null zonder fout", () => {
  const contact = mapMauticContactFull({
    id: "124",
    fields: {
      all: {
        firstname: "Pieter",
        lastname: "Bakker",
        address1: "Bergweg 12 bis",
      },
    },
  });

  assert.equal(contact.huisnummer, null);
  assert.equal(contact.huisnummerToevoeging, null);
  assert.equal(contact.otdAanhef, null);
  assert.equal(contact.otdInitialen, null);
  assert.equal(contact.otdVoornamen, null);
  assert.equal(contact.geboortedatum, null);
  assert.equal(contact.contactV1.huisnummer, "12");
  assert.equal(contact.contactV1.toevoeging, "bis");
  assert.ok(contact.contactV1.normalizationWarnings.some((warning) => warning.code === "parsed_address1"));
});
