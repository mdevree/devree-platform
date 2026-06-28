import test from "node:test";
import assert from "node:assert/strict";
import { buildNewsletterUrl, renderNewsletterIssue } from "./newsletter";

test("buildNewsletterUrl voegt nieuwsbrief UTM parameters toe", () => {
  const url = buildNewsletterUrl("https://www.devreemakelaardij.nl/woning?x=1", "Juni update");

  assert.equal(
    url,
    "https://www.devreemakelaardij.nl/woning?x=1&utm_source=nieuwsbrief&utm_medium=email&utm_campaign=juni-update"
  );
});

test("renderNewsletterIssue maakt HTML en plain text uit blokken", () => {
  const rendered = renderNewsletterIssue({
    id: "issue-1",
    name: "Juni update",
    subject: "Nieuws uit de markt",
    preheader: "De belangrijkste updates op een rij.",
    blocks: [
      {
        type: "TEXT",
        title: "Nieuwe woning",
        body: "Bekijk de nieuwste woning in Voorburg.",
        url: "https://www.devreemakelaardij.nl/woningen/voorbeeld",
        ctaLabel: "Bekijk woning",
        item: null,
      },
    ],
  });

  assert.match(rendered.html, /Nieuws uit de markt/);
  assert.match(rendered.html, /utm_source=nieuwsbrief/);
  assert.match(rendered.plainText, /Nieuwe woning/);
  assert.match(rendered.plainText, /Bekijk woning/);
});
