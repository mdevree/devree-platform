import test from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, decodeEmbedding, encodeEmbedding } from "./embedding";
import { sanitizeForExternal } from "./sanitize";
import { classifyQuery, selectDiverseResults, sourceLexicalCoverage } from "./search";
import { parsePdokPoint } from "./geocode";

test("verwijdert contact- en dossiergegevens voor externe AI", () => {
  const clean = sanitizeForExternal("Mail a@b.nl, bel 06 12345678, dossier T203357 bij 3208LL 209");
  assert.doesNotMatch(clean, /a@b\.nl|0612345678|T203357|3208LL 209/i);
});

test("embeddings blijven binair verliesarm en vergelijkbaar", () => {
  const input = [0.25, -0.5, 0.75];
  const decoded = decodeEmbedding(encodeEmbedding(input));
  assert.deepEqual(decoded, input);
  assert.ok(cosineSimilarity(input, decoded) > 0.999);
});

test("normvragen en praktijkvragen krijgen verschillende bronrouting", () => {
  assert.equal(classifyQuery("Wat vereist de NWWI instructie?"), "REGELVRAAG");
  assert.equal(classifyQuery("Welke eerdere tekst schreef ik voor deze buurt?"), "PRAKTIJKVRAAG");
  assert.equal(classifyQuery("Welke taxaties zijn er in Maassluis?"), "PRAKTIJKVRAAG");
  assert.equal(classifyQuery("Zoek het gevalideerde taxatierapport Burg. Rippingstraat 2 D"), "PRAKTIJKVRAAG");
});

test("herkent een expliciet adres zonder verdunning door vraagwoorden", () => {
  const query = "Zoek het gevalideerde taxatierapport Burg. Rippingstraat 2 D, 3145 MD Maassluis. Welke bron en passages zijn beschikbaar?";
  const source = "Burg. Rippingstraat 2 D, 3145 MD Maassluis";
  assert.ok(sourceLexicalCoverage(query, source) >= 0.7);
});

test("begrens lange bronnen maar behoud meerdere passages van een exacte rapportmatch", () => {
  const items = [
    { sourceId: "instruction", sourceType: "NWWI_INSTRUCTION", sourceMatch: 0.1, relevance: 0.9, id: "i1" },
    { sourceId: "instruction", sourceType: "NWWI_INSTRUCTION", sourceMatch: 0.1, relevance: 0.8, id: "i2" },
    { sourceId: "instruction", sourceType: "NWWI_INSTRUCTION", sourceMatch: 0.1, relevance: 0.7, id: "i3" },
    { sourceId: "report", sourceType: "VALIDATED_REPORT", sourceMatch: 0.6, relevance: 0.6, id: "r1" },
    { sourceId: "report", sourceType: "VALIDATED_REPORT", sourceMatch: 0.6, relevance: 0.5, id: "r2" },
    { sourceId: "report", sourceType: "VALIDATED_REPORT", sourceMatch: 0.6, relevance: 0.4, id: "r3" },
  ];
  const selected = selectDiverseResults(items, 6);
  assert.deepEqual(selected.map((item) => item.id), ["i1", "r1", "r2", "r3"]);
});

test("leest PDOK WGS84 coordinaten in de juiste volgorde", () => {
  assert.deepEqual(parsePdokPoint("POINT(4.2451 51.9062)"), { longitude: 4.2451, latitude: 51.9062 });
});
