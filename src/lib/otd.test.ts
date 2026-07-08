import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCourtage,
  formatEuro,
  firstCompleteKadasterRegel,
  isOtdTriggerFromRealworks,
  kadasterRegelFromRealworksFields,
  normalizeKadasterText,
  normalizeRealworksBrokerObjectForOtd,
  otdCompletenessIssues,
  otdProjectName,
  projectUpdateDataFromOtd,
  signatureBlocksForOtd,
} from "./otd";

const HOEK_REALWORKS_FIELDS = {
  _systemid: "10409219",
  project_systemid: "24533077",
  objectcode: "SE11902",
  lisnr: "SE11902",
  lisstreet: "A.M. de Jongstraat",
  liststrnr: "34",
  liszipcode: "3202 AD",
  liscity: "SPIJKENISSE",
  lissalepr: "375.000,00",
  lissalecon: "1",
  lissalecon__MASK: "0;|1;kosten koper|2;vrij op naam",
  lisstate: "13",
  lisstate__MASK: "0;Prospect|13;In aanmelding|1;Beschikbaar",
  courtage3: "1,25",
  energieeinddatum: "21-06-2031",
  reslivspac: "116",
  lisrcode: "882456",
  lisrcode_result: "Stéphan Hoek ",
};

test("herkent In aanmelding als OTD-trigger", () => {
  assert.equal(isOtdTriggerFromRealworks(HOEK_REALWORKS_FIELDS), true);
  assert.equal(isOtdTriggerFromRealworks({ ...HOEK_REALWORKS_FIELDS, lisstate: "1", lisstate__MASK: "1;Beschikbaar" }), false);
});

test("normaliseert Realworks brokerobject save naar OTD-projectdata", () => {
  const data = normalizeRealworksBrokerObjectForOtd(
    HOEK_REALWORKS_FIELDS,
    new Date("2026-07-07T10:00:00+02:00"),
  );

  assert.equal(data.realworksSystemId, "10409219");
  assert.equal(data.realworksObjectCode, "SE11902");
  assert.equal(data.object.adres, "A.M. de Jongstraat 34");
  assert.equal(data.object.postcode, "3202 AD");
  assert.equal(data.object.plaats, "SPIJKENISSE");
  assert.equal(data.afspraken.vraagprijs, 375000);
  assert.equal(data.afspraken.koopconditie, "kosten koper");
  assert.equal(data.afspraken.courtagePercentage, 1.25);
  assert.equal(data.kosten.energielabel, 0);
  assert.equal(data.opdrachtgevers[0].naam, "Stéphan Hoek");
});

test("bewaart objectcode als platform Realworks ID", () => {
  const data = normalizeRealworksBrokerObjectForOtd(
    HOEK_REALWORKS_FIELDS,
    new Date("2026-07-07T10:00:00+02:00"),
  );

  assert.equal(projectUpdateDataFromOtd(data).realworksId, "SE11902");
  assert.equal(projectUpdateDataFromOtd(data).realworksSystemId, "10409219");
  assert.equal(projectUpdateDataFromOtd(data).realworksProjectSystemId, "24533077");
  assert.equal(projectUpdateDataFromOtd(data).aanvaarding, "in overleg");
});

test("markeert kadaster en opdrachtgeverdetails als controlepunten", () => {
  const data = normalizeRealworksBrokerObjectForOtd(
    HOEK_REALWORKS_FIELDS,
    new Date("2026-07-07T10:00:00+02:00"),
  );
  const issues = otdCompletenessIssues(data);

  assert.ok(issues.some((issue) => issue.field === "object.kadastraal"));
  assert.ok(issues.some((issue) => issue.field === "opdrachtgevers.0.voornamen"));
  assert.ok(issues.some((issue) => issue.field === "opdrachtgevers.0.email"));
});

test("ondersteunt meerdere opdrachtgevers en ondertekenblokken", () => {
  const blocks = signatureBlocksForOtd([
    { aanhef: "De heer", initialen: "S.C.", naam: "Hoek" },
    { aanhef: "Mevrouw", initialen: "A.", naam: "Hoek" },
    { aanhef: "De heer", initialen: "B.", naam: "Voorbeeld" },
  ]);

  assert.deepEqual(blocks.map((block) => block.title), [
    "Opdrachtgever 1",
    "Opdrachtgever 2",
    "Opdrachtgever 3",
    "Het NVM-lid",
  ]);
  assert.equal(blocks[1].name, "Mevrouw A. Hoek");
});

test("formatteert bedragen en courtage voor OTD-weergave", () => {
  assert.equal(formatEuro(375000), "€ 375.000,-");
  assert.equal(formatCourtage(1.25), "1,25 % incl. BTW");
});

test("bouwt projectnaam uit adres en plaats", () => {
  const data = normalizeRealworksBrokerObjectForOtd(
    HOEK_REALWORKS_FIELDS,
    new Date("2026-07-07T10:00:00+02:00"),
  );

  assert.equal(otdProjectName(data), "A.M. de Jongstraat 34, SPIJKENISSE");
});

test("parseert eenvoudige kadastertekst naar OTD-velden", () => {
  assert.deepEqual(normalizeKadasterText("Spijkenisse A 1234 groot 124 m²"), {
    gemeente: "Spijkenisse",
    sectie: "A",
    nummer: "1234",
    grootteM2: "124",
    rawText: "Spijkenisse A 1234 groot 124 m²",
  });
});

test("parseert Realworks kadaster-save velden naar OTD-velden", () => {
  assert.deepEqual(kadasterRegelFromRealworksFields({
    kadlisnr: "SE11905",
    kadcity: "Pernis",
    kadsection: "B",
    kadperc: "2896",
    ko_grootteperceel: "196",
    kadastersoort: "1",
    kadastersoort__MASK: "1;Volle eigendom|2;Erfpacht",
  }), {
    gemeente: "Pernis",
    sectie: "B",
    nummer: "2896",
    grootteM2: "196",
    eigendomssituatie: "Volle eigendom",
    rawText: "Pernis B 2896 196 m²",
  });
});

test("kiest eerste complete kadasterregel", () => {
  const row = firstCompleteKadasterRegel([
    { rawText: "onvolledig" },
    { gemeente: "Spijkenisse", sectie: "A", nummer: "1234", grootteM2: "124" },
  ]);

  assert.equal(row?.nummer, "1234");
});
