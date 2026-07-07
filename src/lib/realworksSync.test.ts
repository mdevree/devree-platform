import test from "node:test";
import assert from "node:assert/strict";
import { isCompleteEmail, payloadHash, stableJson, validateRealworksContactPayload } from "./realworksSync";

test("herkent incomplete e-mails", () => {
  assert.equal(isCompleteEmail("tu"), false);
  assert.equal(isCompleteEmail("tugrul"), false);
  assert.equal(isCompleteEmail("tugrul_batuhan@hotmail.com"), true);
});

test("stable hash is onafhankelijk van key-volgorde", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  assert.equal(payloadHash({ b: 2, a: 1 }), payloadHash({ a: 1, b: 2 }));
});

test("contact save blokkeert brede xhr en incomplete e-mail", () => {
  const reasons = validateRealworksContactPayload({
    eventType: "contact.save",
    realworksPath: "/servlets/objects/rela.person/newrelation",
    data: { email: "tu", firstname: "Tugrul" },
  });

  assert.ok(reasons.some((reason) => reason.includes("/rela.person/save")));
  assert.ok(reasons.some((reason) => reason.includes("compleet e-mailadres")));
});

test("contact save accepteert echte save met complete e-mail", () => {
  assert.deepEqual(
    validateRealworksContactPayload({
      eventType: "contact.save",
      realworksPath: "/servlets/objects/rela.person/save",
      data: { _systemid: "123", email: "tugrul_batuhan@hotmail.com" },
    }),
    []
  );
});
