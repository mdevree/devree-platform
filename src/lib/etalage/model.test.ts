import assert from "node:assert/strict";
import test from "node:test";
import {
  adopt,
  changedGroups,
  effectivePpi,
  isDraft,
  priceChoice,
  slot,
  suggestSlots,
  validateSheet,
  type Draft,
  type Source,
} from "./model";
import { suggestText } from "./text";
import { trustedImage } from "./source";

const source: Source = {
  code: "SE11910",
  street: "Baarsveen 402",
  city: "Spijkenisse",
  websitePrice: 450000,
  projectPrice: 450000,
  priceLabel: "Vraagprijs",
  condition: "k.k.",
  delivery: "in overleg",
  description: "Hoekwoning met een tuin.",
  status: "Beschikbaar",
  mediaKey: "1",
};
const photos = Array.from({ length: 59 }, (_, i) => ({
  id: i + 1,
  url: "",
  thumb: "",
  width: 800,
  height: 533,
  label: "Foto " + i,
}));
const draft: Draft = {
  source,
  text: "Eigen etalagetekst.",
  slots: suggestSlots(photos, 3),
  priceSource: priceChoice(source),
};

test("voorstel gebruikt de hoofdfoto en twaalf verschillende vakken", () => {
  assert.equal(draft.slots[0].id, 3);
  assert.equal(new Set(draft.slots.map((s) => s.id)).size, 13);
  assert.equal(validateSheet(draft, photos, "set"), "");
  assert.ok(isDraft(draft));
  assert.ok(
    !isDraft({
      ...draft,
      slots: [...draft.slots.slice(1), { id: 1, x: -10, y: 50, zoom: 1 }],
    }),
  );
  assert.ok(effectivePpi(photos[0], slot(1), true) < 150);
});
test("prijswijziging behoudt tekst, fotovolgorde en uitsneden", () => {
  const current = { ...source, websitePrice: 440000, status: "Onder bod" };
  assert.deepEqual(changedGroups(source, current), ["prijs", "status"]);
  const updated = adopt(draft, current, "prijs", "Een nieuw voorstel.");
  assert.equal(updated.priceSource, null);
  assert.equal(updated.text, draft.text);
  assert.equal(updated.slots, draft.slots);
  assert.deepEqual(changedGroups(updated.source, current), ["status"]);
  assert.match(validateSheet(updated, photos, "voorblad"), /vraagprijs/);
  assert.equal(validateSheet(updated, photos, "fotoblad-2"), "");
});
test("verwijderde foto blokkeert alleen de betreffende pagina", () => {
  const available = photos.filter((p) => p.id !== draft.slots[8].id);
  assert.equal(validateSheet(draft, available, "voorblad"), "");
  assert.equal(validateSheet(draft, available, "fotoblad-1"), "");
  assert.match(validateSheet(draft, available, "fotoblad-2"), /fotovak 8/);
});
test("tekstvoorstel eindigt met een volledige zin en bronbestanden zijn websiteuploads", async () => {
  const sentence = "De keuken kijkt uit op de tuin. ";
  const proposed = await suggestText(sentence.repeat(160));
  assert.ok(proposed.length > 900 && proposed.length < 3000);
  assert.ok(proposed.endsWith("tuin."));
  assert.equal(
    trustedImage(
      "https://www.devreemakelaardij.nl/wp-content/uploads/2026/test.jpg",
    ),
    true,
  );
  assert.equal(
    trustedImage("https://example.com/wp-content/uploads/test.jpg"),
    false,
  );
});
