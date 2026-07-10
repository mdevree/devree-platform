import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalAddressKey,
  extractMoveObjectPage,
  normalizePostcode,
  splitHouseNumber,
} from "./marketObjects";

test("normaliseert postcode en huisnummer voor adresmatching", () => {
  assert.equal(normalizePostcode("3205 ce"), "3205CE");
  assert.equal(normalizePostcode("0320 AA"), null);
  assert.deepEqual(splitHouseNumber("10 a"), {
    houseNumber: "10",
    houseNumberAddition: "A",
  });
  assert.deepEqual(splitHouseNumber("22-2"), {
    houseNumber: "22",
    houseNumberAddition: "2",
  });
  assert.equal(
    canonicalAddressKey({
      postcode: "3205 ce",
      houseNumber: "10",
      houseNumberAddition: "a",
    }),
    "3205CE:10:A"
  );
});

test("extraheert compacte Move-verrijking zonder ruwe HTML", () => {
  const html = `
    <html>
      <head>
        <title>Nachtegaallaan 8 3181 SL Rozenburg</title>
        <meta name="description" content="Ruime gezinswoning met vijf slaapkamers &amp; energielabel A." />
        <meta property="og:image" content="https://images.realworks.nl/servlets/images/uitwisseling.objectmedia/1.webp?width=1920&amp;height=1080" />
      </head>
      <body>
        <script>
          self.__next_f.push([1,"\\"label\\":\\"Energy class\\",\\"value\\":\\"A\\""]);
          self.__next_f.push([1,"\\"label\\":\\"Number of bedrooms\\",\\"value\\":\\"5\\""]);
        </script>
        <img src="https://images.realworks.nl/servlets/images/uitwisseling.objectmedia/2.jpg?width=600" />
      </body>
    </html>
  `;

  const extracted = extractMoveObjectPage(html);
  assert.equal(extracted.title, "Nachtegaallaan 8 3181 SL Rozenburg");
  assert.equal(
    extracted.listingText,
    "Ruime gezinswoning met vijf slaapkamers & energielabel A."
  );
  assert.equal(extracted.images.length, 2);
  assert.deepEqual(extracted.features.kenmerken, [
    { label: "Energy class", value: "A" },
    { label: "Number of bedrooms", value: "5" },
  ]);
});
