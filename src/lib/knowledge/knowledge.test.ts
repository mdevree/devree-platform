import test from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, decodeEmbedding, encodeEmbedding } from "./embedding";
import { sanitizeForExternal } from "./sanitize";
import { classifyQuery } from "./search";
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
});

test("leest PDOK WGS84 coordinaten in de juiste volgorde", () => {
  assert.deepEqual(parsePdokPoint("POINT(4.2451 51.9062)"), { longitude: 4.2451, latitude: 51.9062 });
});
