import test from "node:test";
import assert from "node:assert/strict";
import { calculatePromotion, newPromotion, submittedPromotion, readPromotion, RATES, RENT_RATES, SURCHARGE, promotionLines } from "./promotion";
import { buildVerkoopHtml } from "../app/api/projecten/[id]/otd/pdf/verkoopHtml";
import type { Project } from "@prisma/client";

test("alle toegestane koopcombinaties inclusief btw", () => {
  const cases = [["BRONS", "BASIS", 57900], ["BRONS", "COMPLEET", 70400], ["BRONS", "COMPLEET_PLUS", 72900], ["ZILVER", "COMPLEET", 87400], ["ZILVER", "COMPLEET_PLUS", 89900], ["GOUD", "COMPLEET", 107400], ["GOUD", "COMPLEET_PLUS", 109900]] as const;
  for (const [f, p, total] of cases) assert.equal(calculatePromotion(RATES, f, p).totalCents, total);
  assert.equal(newPromotion().totalCents, 87400);
  assert.equal(calculatePromotion(RENT_RATES, "ZILVER", "COMPLEET").totalCents, 50400);
});
test("ongeldige combinaties en onbekende keuzes worden geweigerd", () => {
  for (const f of ["ZILVER", "GOUD"]) assert.throws(() => submittedPromotion(newPromotion(), { funda: f, photography: "BASIS" }));
  for (const f of ["toString", "__proto__", "PLATINA", null, 4]) assert.throws(() => calculatePromotion(RATES, f, "COMPLEET"));
  assert.throws(() => submittedPromotion(newPromotion(), {}));
});
test("voorstel bewaart tarieven en centen; browserbedragen zijn niet leidend", () => {
  const oldRates = { ...RATES, version: "oud", funda: { ...RATES.funda, ZILVER: 44099 } };
  const offered = calculatePromotion(oldRates, "ZILVER", "COMPLEET");
  const stored = JSON.parse(JSON.stringify(offered));
  const selected = submittedPromotion(stored, { funda: "ZILVER", photography: "COMPLEET_PLUS", totalCents: 1 } as Parameters<typeof submittedPromotion>[1]);
  assert.equal(selected?.totalCents, 89099);
  assert.equal(readPromotion(stored)?.totalCents, 86599);
  assert.equal(newPromotion(stored).totalCents, 87400);
  assert.equal(submittedPromotion(null, { funda: "GOUD", photography: "COMPLEET_PLUS" }), null);
  assert.equal(readPromotion(null), null);
});
test("opdracht toont dezelfde uitsplitsing en voetnoot; legacy blijft intact", () => {
  const promotion = newPromotion();
  const project = { promotion, kostenPubliciteit: 650 } as unknown as Project;
  const html = buildVerkoopHtml({ project, opdrachtgevers: [] });
  for (const [,value] of promotionLines(promotion)) assert.ok(html.includes(value));
  assert.ok(html.includes(SURCHARGE));
  assert.ok(!html.includes("max. € 650"));
  const legacy = buildVerkoopHtml({ project: { ...project, promotion: null }, opdrachtgevers: [] });
  assert.match(legacy, /publiciteitskosten/);
  assert.ok(!legacy.includes(SURCHARGE));
});
