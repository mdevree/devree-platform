import { test } from "node:test";
import assert from "node:assert/strict";
import { woningSlugVanUrl, isWoningUrl } from "./woningUrl";

test("haalt slug uit volledige woning-URL", () => {
  assert.equal(
    woningSlugVanUrl("https://www.devreemakelaardij.nl/woning/dorpsstraat-12-utrecht/"),
    "dorpsstraat-12-utrecht"
  );
});

test("negeert querystring en hash", () => {
  assert.equal(
    woningSlugVanUrl("https://www.devreemakelaardij.nl/woning/kerkweg-3/?utm_source=mail#foto"),
    "kerkweg-3"
  );
});

test("werkt met relatief pad", () => {
  assert.equal(woningSlugVanUrl("/woning/Laan-5/"), "laan-5");
});

test("niet-woningpagina geeft null", () => {
  assert.equal(woningSlugVanUrl("https://www.devreemakelaardij.nl/over-ons/"), null);
  assert.equal(isWoningUrl("https://www.devreemakelaardij.nl/"), false);
});

test("lege of ongeldige input geeft null", () => {
  assert.equal(woningSlugVanUrl(null), null);
  assert.equal(woningSlugVanUrl(undefined), null);
  assert.equal(woningSlugVanUrl(""), null);
});
