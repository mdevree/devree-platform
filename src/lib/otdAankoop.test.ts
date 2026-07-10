import test from "node:test";
import assert from "node:assert/strict";
import {
  AANKOOP_WERKGEBIED_DEFAULT,
  AANKOOP_WERKZAAMHEDEN,
  DEFAULT_AANKOOP_TARIEVEN,
  aankoopTarievenFromProject,
  otdAankoopCompletenessIssues,
} from "./otdAankoop";

const LEEG_PROJECT = {
  aankoopTariefVast: null,
  aankoopToeslagExtraWoning: null,
  aankoopMaxWoningen: null,
  aankoopKostenNietDoorzetten: null,
  kostenIntrekking: null,
  kostenBedenktijd: null,
  aankoopWerkgebied: null,
};

test("aankooptarieven vallen terug op platformdefaults", () => {
  const tarieven = aankoopTarievenFromProject(LEEG_PROJECT);

  assert.equal(tarieven.vastTarief, 3000);
  assert.equal(tarieven.toeslagExtraWoning, 100);
  assert.equal(tarieven.maxWoningen, 5);
  assert.equal(tarieven.intrekking, 750);
  assert.equal(tarieven.bedenktijd, 500);
  assert.equal(tarieven.nietDoorzetten, 500);
  assert.equal(tarieven.werkgebied, AANKOOP_WERKGEBIED_DEFAULT);
});

test("projectwaarden overrulen de defaults", () => {
  const tarieven = aankoopTarievenFromProject({
    aankoopTariefVast: 3500,
    aankoopToeslagExtraWoning: 125,
    aankoopMaxWoningen: 8,
    aankoopKostenNietDoorzetten: 600,
    kostenIntrekking: 800,
    kostenBedenktijd: 550,
    aankoopWerkgebied: "Regio Rotterdam en omstreken",
  });

  assert.equal(tarieven.vastTarief, 3500);
  assert.equal(tarieven.toeslagExtraWoning, 125);
  assert.equal(tarieven.maxWoningen, 8);
  assert.equal(tarieven.intrekking, 800);
  assert.equal(tarieven.bedenktijd, 550);
  assert.equal(tarieven.nietDoorzetten, 600);
  assert.equal(tarieven.werkgebied, "Regio Rotterdam en omstreken");
});

test("0 en lege werkgebiedtekst vallen terug op defaults", () => {
  const tarieven = aankoopTarievenFromProject({
    ...LEEG_PROJECT,
    aankoopTariefVast: 0,
    kostenIntrekking: 0,
    aankoopWerkgebied: "   ",
  });

  assert.equal(tarieven.vastTarief, DEFAULT_AANKOOP_TARIEVEN.vastTarief);
  assert.equal(tarieven.intrekking, DEFAULT_AANKOOP_TARIEVEN.intrekking);
  assert.equal(tarieven.werkgebied, AANKOOP_WERKGEBIED_DEFAULT);
});

test("werkzaamhedenlijst volgt het referentiedocument", () => {
  assert.equal(AANKOOP_WERKZAAMHEDEN.length, 8);
  assert.equal(AANKOOP_WERKZAAMHEDEN[0], "Zoeken in het woningaanbod");
  assert.equal(AANKOOP_WERKZAAMHEDEN[7], "Afwikkeling van de aankoop");
});

test("completeness vereist opdrachtgevers maar geen objectgegevens", () => {
  const zonder = otdAankoopCompletenessIssues([]);
  assert.equal(zonder.length, 1);
  assert.equal(zonder[0].field, "opdrachtgevers");
  assert.equal(zonder[0].severity, "required");

  const compleet = otdAankoopCompletenessIssues([
    { naam: "Beelaard", voornamen: "Hendrik", email: "henk@example.com" },
  ]);
  assert.equal(compleet.length, 0);

  const incompleet = otdAankoopCompletenessIssues([{ naam: "Beelaard" }]);
  assert.deepEqual(
    incompleet.map((issue) => issue.field),
    ["opdrachtgevers.0.voornamen", "opdrachtgevers.0.email"],
  );
  assert.ok(incompleet.every((issue) => issue.severity === "warning"));
});
