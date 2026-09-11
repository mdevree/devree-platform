import test from "node:test";
import assert from "node:assert/strict";
import { phone, day, dutchDay, periodFilter, classify, addresses } from "./rules";
test("Dutch telephone variants identify the same contact", () => { for (const n of ["06 4554 4190", "+31 (6) 45544190", "0031 6 45544190"])
    assert.equal(phone(n), "31645544190"); assert.equal(phone("123"), ""); });
test("historical and unknown dates, invalid dates rejected", () => { assert.equal(day(null), null); assert.equal(day("2026-09-09")?.toISOString(), "2026-09-09T00:00:00.000Z"); assert.throws(() => day("2026-02-30")); });
test("Amsterdam midnight determines period, independent of UTC day", () => { const now = new Date("2026-03-31T22:30:00Z"); assert.equal(dutchDay(now), "2026-04-01"); assert.equal(periodFilter("kwartaal", now)?.gte.toISOString(), "2026-04-01T00:00:00.000Z"); assert.equal(periodFilter("alles", now), undefined); });
test("Rachelle introduction strips office header and signature", () => { const r = classify("tel. (0181) 611919 · info@devreemakelaardij.nl\n\nGoedemiddag Frans,\nWil jij een afspraak inplannen met Rachelle Mensinga van der Hoeven. Telefoonnummer: +31645544190\nMet vriendelijke groet,\nMelvin de Vree\n0181-611919", "Doorverwijzing"); assert.equal(r.referral, true); assert.deepEqual(r.phones, ["31645544190"]); });
test("name-only family and existing appointment are recognized for review", () => { assert.equal(classify("Als het goed is neemt de familie Rietveld zelf contact op om een afspraak te maken.", "Rietveld").referral, true); assert.equal(classify("Hierbij de gegevens voor je afspraak van dinsdag om 3 uur.", "Mevrouw Mutsaers").referral, true); });
test("financial administration is not a referral", () => { for (const subject of ["Factuur", "Taxatierapport", "Schademelding", "Taxatie NWWI", "RE: Taxatie Hoge Weije 17"]) {
    assert.equal(classify("Wil jij een afspraak inplannen met de klant?", subject).referral, false);
} });
test("quoted historical introduction cannot trigger a referral", () => { for (const body of ["Dankjewel!\nVan: Melvin\nWil jij een afspraak inplannen met Test?", "Dankjewel!<blockquote>Wil jij een afspraak inplannen met Test?</blockquote>", "Dankjewel!\n> Wil jij een afspraak inplannen met Test?"]) {
    assert.equal(classify(body, "Re: Doorverwijzing").referral, false);
} });
test("recipient parsing matches exact addresses", () => { assert.deepEqual(addresses(['Frans <Frans@vwadvies.nl>', 'info@vwadvies.nl']), ['frans@vwadvies.nl', 'info@vwadvies.nl']); });
