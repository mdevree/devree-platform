import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaxatieInvoicePayload,
  getTaxatieInvoiceIdempotencyKey,
  type TaxatieInvoiceProject,
} from "./debiteurenInvoicePayload";

const PROJECT: TaxatieInvoiceProject = {
  id: "project-1",
  type: "TAXATIE",
  name: "Taxatie Voorbeeldstraat 1",
  woningAdres: "Voorbeeldstraat 1",
  woningPostcode: "3011 AA",
  woningPlaats: "Rotterdam",
  mauticContactId: null,
  contacts: [
    { mauticContactId: 123, role: "opdrachtgever", addedAt: new Date("2026-07-21T00:00:00Z") },
  ],
  debiteurenLink: { debiteurenKlantId: 456 },
};

test("bouwt taxatiefactuurpayload met expliciet bedrag en vaste idempotency-key", () => {
  const result = buildTaxatieInvoicePayload(PROJECT, { amountExcl: "650" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.idempotencyKey, "project:project-1:taxatie-invoice:v1");
  assert.equal(result.payload.customerId, 456);
  assert.equal(result.payload.invoiceType, "taxatie");
  assert.equal(result.payload.subject, "Taxatie Voorbeeldstraat 1, 3011 AA, Rotterdam");
  assert.deepEqual(result.payload.lines, [{ description: "Taxatierapport", amountExcl: 650, vatRate: 0.21 }]);
  assert.deepEqual(result.payload.reference, { platformProjectId: "project-1", mauticContactId: 123 });
});

test("taxatiefactuur idempotency-key is gedeeld tussen API en UI", () => {
  assert.equal(getTaxatieInvoiceIdempotencyKey("project-1"), "project:project-1:taxatie-invoice:v1");
});

test("bouwt taxatiefactuurpayload met formulierdetails", () => {
  const result = buildTaxatieInvoicePayload(PROJECT, {
    amountExcl: "725.50",
    subject: "Taxatie speciaal dossier",
    description: "Taxatie validatie NWWI",
    bank: "abn",
    invoiceDate: "2026-07-21",
    dueDate: "2026-08-04",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.subject, "Taxatie speciaal dossier");
  assert.equal(result.payload.bank, "abn");
  assert.equal(result.payload.invoiceDate, "2026-07-21");
  assert.equal(result.payload.dueDate, "2026-08-04");
  assert.deepEqual(result.payload.lines, [{ description: "Taxatie validatie NWWI", amountExcl: 725.5, vatRate: 0.21 }]);
});

test("weigert taxatiefactuurpayload zonder debiteurenlink", () => {
  const result = buildTaxatieInvoicePayload({ ...PROJECT, debiteurenLink: null }, { amountExcl: 650 });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "Koppel eerst een debiteurenklant aan dit project",
  });
});

test("weigert taxatiefactuurpayload zonder positief bedrag", () => {
  const result = buildTaxatieInvoicePayload(PROJECT, { amountExcl: 0 });

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "amountExcl is verplicht en moet positief zijn",
  });
});
