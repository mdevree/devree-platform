import test from "node:test";
import assert from "node:assert/strict";
import {
  renderHandtekeningen,
  renderOpdrachtgeverBlokken,
  type Opdrachtgever,
} from "../app/api/projecten/[id]/otd/pdf/shared";

test("laat aanhef weg bij opdrachtgevernaam in de OTD-pdf", () => {
  const opdrachtgevers: Opdrachtgever[] = [{
    naam: "Stéphan Hoek",
    achternaam: "Hoek",
    aanhef: "Geachte heer",
    initialen: "S.C.",
  }];

  const opdrachtgeverBlok = renderOpdrachtgeverBlokken(opdrachtgevers);
  const handtekeningen = renderHandtekeningen(opdrachtgevers);

  assert.match(opdrachtgeverBlok, /Naam[\s\S]*S\.C\. Hoek/);
  assert.match(handtekeningen, /naam: S\.C\. Hoek/);
  assert.doesNotMatch(opdrachtgeverBlok, /Geachte heer/i);
  assert.doesNotMatch(handtekeningen, /Geachte heer/i);
});
