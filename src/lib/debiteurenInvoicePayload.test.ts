import assert from "node:assert/strict";
import test from "node:test";

import { buildTaxatieInvoicePayload, type TaxatieInvoiceProject } from "./debiteurenInvoicePayload";

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
