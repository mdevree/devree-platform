import assert from "node:assert/strict";
import test from "node:test";

import {
  dateFromDebiteuren,
  moneyToCents,
  statusFromDebiteurenFactuur,
} from "./projectDebiteurenInvoices";

test("statusFromDebiteurenFactuur mapt betaalstatus naar platformstatus", () => {
  assert.equal(statusFromDebiteurenFactuur({ betaald: true, verlopen: true }), "paid");
  assert.equal(statusFromDebiteurenFactuur({ betaald: false, verlopen: true }), "overdue");
  assert.equal(statusFromDebiteurenFactuur({ betaald: false, verlopen: false }), "open");
});

test("dateFromDebiteuren accepteert alleen ISO-datums zonder tijd", () => {
  assert.deepEqual(dateFromDebiteuren("2026-07-21"), new Date("2026-07-21T00:00:00.000Z"));
  assert.equal(dateFromDebiteuren(null), null);
  assert.equal(dateFromDebiteuren("21-07-2026"), null);
});

test("moneyToCents rondt eurobedragen naar centen", () => {
  assert.equal(moneyToCents(786.5), 78650);
  assert.equal(moneyToCents(0.015), 2);
});
