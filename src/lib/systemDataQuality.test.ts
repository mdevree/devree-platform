import test from "node:test";
import assert from "node:assert/strict";
import { isExpectedMissingAgendaContact, isHandledQuarantineEvent } from "./systemDataQuality";

test("planner containers without a visitor are not missing-contact incidents", () => {
  const block = { agtype: "Bezichtigingsblok (planner)", agrcode: null, relationRelationid: null, enrichmentStatus: "no_contact" };
  assert.equal(isExpectedMissingAgendaContact(block), true);
  assert.equal(isExpectedMissingAgendaContact({ ...block, agtype: "Bezichtiging" }), false);
  assert.equal(isExpectedMissingAgendaContact({ ...block, agrcode: "891839" }), false);
  assert.equal(isExpectedMissingAgendaContact({ ...block, relationRelationid: "123" }), false);
  assert.equal(isExpectedMissingAgendaContact({ ...block, enrichmentStatus: "error" }), false);
});

test("only the exact handled quarantine event stops raising an alert", () => {
  const handled = new Set(["one"]);
  assert.equal(isHandledQuarantineEvent({ status: "quarantined", payloadHash: "one:quarantine" }, handled), true);
  assert.equal(isHandledQuarantineEvent({ status: "quarantined", payloadHash: "two:quarantine" }, handled), false);
  assert.equal(isHandledQuarantineEvent({ status: "failed", payloadHash: "one:quarantine" }, handled), false);
  assert.equal(isHandledQuarantineEvent({ status: "quarantined", payloadHash: null }, handled), false);
});
