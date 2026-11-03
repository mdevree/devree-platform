import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLijstVanZaken, renderZakenBriefing } from "./lijstVanZaken";
const mask = "4;N.v.t.|1;Blijft achter|2;Gaat mee|3;Kan worden overgenomen";
const sample = { objectcode: "SE11899", _systemid: "1786541", versienummer: "2019", sanitair_vrij_1: "kastje toilet", sanitair_vrij_value_1: "2", sanitair_vrij_value_1__MASK: mask, keuken_inbouw_vrij_1: "elektrische boiler keuken", keuken_inbouw_vrij_value_1: "1", keuken_inbouw_vrij_value_1__MASK: mask, contract_boiler: "2", contract_boiler__MASK: "1;Ja|2;Nee|3;Gaat mee|4;Moet worden overgenomen" };
test("custom descriptions and different masks retain their meaning", () => {
  const d = normalizeLijstVanZaken(sample);
  assert.equal(d.items.find(i => i.label === "kastje toilet")?.answer, "Gaat mee");
  assert.equal(d.items.find(i => i.label === "elektrische boiler keuken")?.answer, "Blijft achter");
  assert.equal(d.items.find(i => i.field === "contract_boiler")?.answer, "Nee");
  assert.equal(d.items.find(i => i.field === "contract_boiler")?.attention, false);
});
test("blank, not applicable and unknown answers remain distinct", () => {
  const d = normalizeLijstVanZaken({ ...sample, oven: "", oven__MASK: mask, koelkast: "4", koelkast__MASK: mask, vriezer: "99", vriezer__MASK: mask });
  assert.equal(d.items.find(i => i.field === "oven")?.answer, "Niet ingevuld");
  assert.equal(d.items.find(i => i.field === "koelkast")?.answer, "N.v.t.");
  assert.equal(d.items.find(i => i.field === "vriezer")?.answer, "Onbekende keuze (99)");
  assert.ok(d.items.filter(i => ["oven", "koelkast", "vriezer"].includes(i.field)).every(i => !i.attention));
});
test("only answer data is stored; seller and authentication data are discarded", () => {
  const d = normalizeLijstVanZaken({ ...sample, CSRFToken: "secret", cookie: "secret", verkoper_result: "Private", verkoper_select: "P", verkoper_select__MASK: "P;Particulier", _callback: "doAfterSave" });
  assert.equal(JSON.stringify(d).includes("secret"), false);
  assert.equal(JSON.stringify(d).includes("Private"), false);
  assert.equal(d.fields._callback, undefined);
  assert.throws(() => normalizeLijstVanZaken({ ...sample, objectcode: "" }));
});
test("PDF briefing escapes free text and labels its source", () => {
  const d = normalizeLijstVanZaken({ ...sample, sanitair_vrij_1: '<script>alert(1)</script>' });
  const html = renderZakenBriefing(d, "03-11-2026");
  assert.ok(html.includes("SE11899"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});
