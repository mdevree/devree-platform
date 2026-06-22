import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAiCallApprovalNote, validateAiCallStartApproval } from "./aiCallApproval";

test("weigert AI-call start zonder menselijke goedkeuring", () => {
  assert.equal(
    validateAiCallStartApproval({}),
    "Menselijke goedkeuring is verplicht voordat de caller mag starten"
  );
});

test("weigert AI-call start zonder exacte BEL bevestiging", () => {
  assert.equal(
    validateAiCallStartApproval({ humanApproved: true }),
    "Typ exact BEL om deze AI-call bewust te starten"
  );
  assert.equal(
    validateAiCallStartApproval({ humanApproved: true, approvalText: "bel" }),
    "Typ exact BEL om deze AI-call bewust te starten"
  );
});

test("accepteert AI-call start alleen met humanApproved en exacte BEL", () => {
  assert.equal(validateAiCallStartApproval({ humanApproved: true, approvalText: "BEL" }), null);
});

test("bouwt auditnotitie met reviewer en tijdstip", () => {
  const note = buildAiCallApprovalNote({
    currentReviewNotes: "Bestaande notitie",
    reviewer: "platform",
    approvedAt: new Date("2026-06-22T17:05:00.000Z"),
  });

  assert.equal(
    note,
    "Bestaande notitie\nAI-call handmatig goedgekeurd met bevestiging BEL door platform op 2026-06-22T17:05:00.000Z."
  );
});
