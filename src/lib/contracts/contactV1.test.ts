import assert from "node:assert/strict";
import test from "node:test";

import examples from "./contactV1.examples.json";
import {
  CONTACT_V1_FIELDS,
  CONTACT_V1_PARTNER_FIELDS,
  CONTACT_V1_VERSION,
  type ContactV1,
} from "./contactV1";

test("ContactV1 voorbeelden gebruiken de vastgelegde veldnamen", () => {
  const fields = [...CONTACT_V1_FIELDS].sort();

  assert.deepEqual(
    examples.map((example) => example.name),
    [
      "volledig-contact",
      "ontbrekend-huisnummer",
      "samengesteld-address1",
      "buitenlandse-postcode",
      "partnercontact",
    ]
  );

  for (const example of examples) {
    const payload = example.payload as ContactV1;
    assert.equal(payload.contractVersion, CONTACT_V1_VERSION);
    assert.equal(payload.source, "mautic");
    assert.deepEqual(Object.keys(payload).sort(), fields);
    assert.equal(typeof payload.mauticContactId, "number");
    assert.equal(typeof payload.achternaam, "string");
    assert.ok(Array.isArray(payload.normalizationWarnings));
  }
});

test("ContactV1 partner gebruikt dezelfde partner-veldnamen", () => {
  const partnerExample = examples.find((example) => example.name === "partnercontact");
  assert.ok(partnerExample?.payload.partner);

  assert.deepEqual(
    Object.keys(partnerExample.payload.partner).sort(),
    [...CONTACT_V1_PARTNER_FIELDS].sort()
  );
});
