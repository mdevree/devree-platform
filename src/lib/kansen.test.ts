import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyKans, groupKansen } from "./kansen";
import type { MauticContactPipeline } from "./mautic";

function contact(overrides: Partial<MauticContactPipeline>): MauticContactPipeline {
  return {
    id: 1,
    firstname: "Test",
    lastname: "Persoon",
    email: "test@example.com",
    phone: "+31612345678",
    mobile: null,
    company: null,
    points: 0,
    lastActive: null,
    verkoopgesprekStatus: null,
    timingGesprek: null,
    segmentPrioriteit: null,
    verkoopreden: null,
    verkooopTiming: null,
    intentieVerkoop: null,
    emailFollowupVerstuurd: false,
    volgendeAfspraakStatus: null,
    datumVerkoopgesprek: null,
    interesses: {
      financiering: null,
      duurzaamheid: null,
      verbouwing: null,
      investeren: null,
      starters: null,
    },
    bezichtigingInteresse: null,
    kijkerEigenWoning: null,
    kijkerOverwegtVerkoop: null,
    kijkerHypotheekStatus: null,
    warmScore: 0,
    ...overrides,
  };
}

const dagenGeleden = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

test("hoge bezichtigingsinteresse → hete koper", () => {
  const item = classifyKans(contact({ bezichtigingInteresse: 75 }));
  assert.equal(item?.type, "hete_koper");
  assert.ok(item?.redenen.some((r) => r.includes("75")));
});

test("eigen woning + overweegt verkoop → opdrachtkans", () => {
  const item = classifyKans(
    contact({ kijkerEigenWoning: true, kijkerOverwegtVerkoop: true })
  );
  assert.equal(item?.type, "opdrachtkans");
});

test("3-6 mnd stil mét e-mail → herwarmen", () => {
  const item = classifyKans(
    contact({ points: 8, lastActive: dagenGeleden(120) })
  );
  assert.equal(item?.type, "herwarmen");
});

test("3-6 mnd stil zonder e-mail → geen herwarmen", () => {
  const item = classifyKans(
    contact({ points: 8, email: null, lastActive: dagenGeleden(120) })
  );
  assert.equal(item, null);
});

test("korter dan 3 mnd stil → nog geen herwarmen", () => {
  const item = classifyKans(
    contact({ points: 8, lastActive: dagenGeleden(60) })
  );
  assert.equal(item, null);
});

test("langer dan 6 mnd stil → buiten segment, geen herwarmen", () => {
  const item = classifyKans(
    contact({ points: 8, lastActive: dagenGeleden(220) })
  );
  assert.equal(item, null);
});

test("recent actief met te weinig punten → geen hete koper", () => {
  const item = classifyKans(
    contact({ points: 3, warmScore: 33, lastActive: dagenGeleden(2) })
  );
  assert.equal(item, null);
});

test("recent actief met 5+ punten → hete koper", () => {
  const item = classifyKans(
    contact({ points: 5, warmScore: 35, lastActive: dagenGeleden(2) })
  );
  assert.equal(item?.type, "hete_koper");
});

test("koud contact zonder signalen → geen kans", () => {
  const item = classifyKans(contact({ points: 2, lastActive: dagenGeleden(5) }));
  assert.equal(item, null);
});

test("hypotheek open voor advies → hypotheekkans", () => {
  const item = classifyKans(
    contact({
      points: 0,
      warmScore: 0,
      kijkerHypotheekStatus: "Nog niet, maar ik sta open voor advies",
    })
  );
  assert.equal(item?.type, "hypotheekkans");
  assert.ok(item?.redenen.some((r) => r.toLowerCase().includes("hypotheek")));
});

test("hypotheek 'ja' (heeft al adviseur) → geen hypotheekkans", () => {
  const item = classifyKans(
    contact({ points: 0, warmScore: 0, kijkerHypotheekStatus: "ja" })
  );
  assert.equal(item, null);
});

test("hete koper heeft voorrang op opdrachtkans", () => {
  const item = classifyKans(
    contact({
      bezichtigingInteresse: 80,
      kijkerEigenWoning: true,
      kijkerOverwegtVerkoop: true,
    })
  );
  assert.equal(item?.type, "hete_koper");
});

test("groupKansen sorteert aflopend op warmScore en levert 4 groepen", () => {
  const groepen = groupKansen([
    contact({ id: 1, bezichtigingInteresse: 65, warmScore: 65 }),
    contact({ id: 2, bezichtigingInteresse: 90, warmScore: 90 }),
  ]);
  assert.equal(groepen.length, 4);
  const heet = groepen.find((g) => g.type === "hete_koper");
  assert.equal(heet?.items[0].warmScore, 90);
  assert.equal(heet?.items[1].warmScore, 65);
});
