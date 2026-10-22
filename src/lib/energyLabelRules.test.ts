import test from "node:test";
import assert from "node:assert/strict";
import { labelAddressKey, mutationAddressKey, listingKind, conversionMetrics, DAY } from "./energyLabelRules";

test("exact address matching preserves house additions and normalizes formatting", () => {
  assert.equal(labelAddressKey("3181 ab", "11", "A", "2"), mutationAddressKey("3181AB", "11 A-2"));
  assert.notEqual(labelAddressKey("3181AB", "11"), mutationAddressKey("3181AB", "11 A"));
  assert.equal(mutationAddressKey(null,"11"), null);
});
test("only explicit sale evidence confirms a sale listing", () => {
  assert.equal(listingKind("Vraagprijs € 350.000,00 kosten koper"), "sale");
  assert.equal(listingKind("€ 1.500,00 per maand"), "rent");
  assert.equal(listingKind("Vraagprijs € 350.000"), "unknown");
  assert.equal(listingKind("Verkocht / Verhuurd per 22-10-2026"), "unknown");
});
test("conversion excludes baseline, known listings, immature and unresolved cohorts", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const s = { detectedAt: new Date(now.getTime()-45*DAY), baseline:false, knownAtDiscovery:false, areaStatus:"matched", buildingStatus:"Bestaand",firstListedAt:new Date(now.getTime()-35*DAY),listingKind:"sale" };
  const stats = conversionMetrics([s,{...s,baseline:true},{...s,knownAtDiscovery:true},{...s,areaStatus:"pending"},{...s,detectedAt:now},{...s,listingKind:"rent"}],now);
  assert.equal(stats[0].eligible,2); assert.equal(stats[0].confirmed,1); assert.equal(stats[0].percent,50);
  assert.equal(stats[0].medianLeadDays,10); assert.equal(stats[1].percent,null);
});
