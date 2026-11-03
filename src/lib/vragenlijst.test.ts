import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVragenlijst, renderQuestionsBriefing } from "./vragenlijst";
const mask = ";Niet beantwoord|1;Ja|0;Nee|2;Niet bekend";
const sample = { _systemid: "1974993", vllisnr: "SE11899", versienummer: "2023", answer_501: "1", answer_501__MASK: mask, answer_502: "aan de linkerkant van de voordeur beetje vocht", answer_601: "2", answer_601__MASK: mask, answer_303: "0", answer_303__MASK: mask, answer_304: "" };
test("question numbers are linked to observed Realworks 2023 texts", () => {
 const d = normalizeVragenlijst(sample);
 assert.equal(d.items.find(i => i.field === "answer_501")?.number, "5A.");
 assert.match(d.items.find(i => i.field === "answer_501")?.question || "", /vochtdoorslag/);
 assert.match(d.items.find(i => i.field === "answer_601")?.question || "", /fundering/);
 assert.equal(d.items.find(i => i.field === "answer_601")?.answer, "Niet bekend");
 assert.equal(d.items.find(i => i.field === "answer_303")?.answer, "Nee");
 assert.equal(d.items.find(i => i.field === "answer_304")?.answer, "Niet beantwoord");
 assert.deepEqual(d.highlights.map(g => g.number), ["5A.", "6A."]);
});
test("part A, credentials and seller identity never enter property briefing", () => {
 const d = normalizeVragenlijst({ ...sample, answer_deel_a_4200: "private", verkoper_result: "private", CSRFToken: "secret" });
 assert.ok(!JSON.stringify(d).includes("private"));assert.ok(!JSON.stringify(d).includes("secret"));
});
test("unknown versions preserve answers without inventing questions", () => {
 const d = normalizeVragenlijst({ ...sample, versienummer: "2099" });
 assert.equal(d.labelsComplete, false);assert.equal(d.highlights.length, 0);
 assert.ok(renderQuestionsBriefing(d).includes("Niet alle vraagteksten"));
});
test("source remarks are escaped in PDF HTML", () => {
 const d = normalizeVragenlijst({ ...sample, answer_502: "vocht <script>alert(1)</script>" });
 assert.ok(!renderQuestionsBriefing(d).includes("<script>"));
});
