import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSourceValuesReadyForExport,
  confirmSourceValue,
  normalizeSourceValue,
  registerSourceObservation,
  sourceValidationSummary,
  sourceValuesEqual,
  type TaxatieDossier,
} from "./taxatieSourceConflicts";

const field = "zonnepanelen_vermogen_wp";

function emptyDossier(): TaxatieDossier {
  return { meta: { dossier_id: "test-1" }, audit_log: [] };
}

function addSolarValue(
  dossier: TaxatieDossier,
  value: number,
  document: string,
  now: string
) {
  return registerSourceObservation(dossier, field, {
    value,
    unit: "Wp",
    source: {
      type: "document",
      document,
      path: `/Taxaties/test/${document}`,
      page: 1,
      field: "opgesteld_vermogen",
      extract: `Opgesteld vermogen ${value} Wp`,
    },
  }, { actor: "n8n:document-verwerker", now });
}

test("detecteert 2063 Wp versus 1898 Wp als conflict zonder een waarde te kiezen", () => {
  const dossier = emptyDossier();
  addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");
  addSolarValue(dossier, 1898, "opnameverslag.pdf", "2026-07-21T08:01:00.000Z");

  const state = dossier.bronwaarde_validatie?.fields[field];
  assert.equal(state?.status, "conflict");
  assert.deepEqual(state?.distinctValues, [2063, 1898]);
  assert.equal(state?.taxateur_bevestigd, null);
  assert.equal((dossier.object as Record<string, unknown> | undefined)?.zonnepanelen, undefined);
  assert.throws(() => assertSourceValuesReadyForExport(dossier), /Export geblokkeerd/);
});

test("één bronwaarde blijft unresolved totdat een taxateur bevestigt", () => {
  const dossier = emptyDossier();
  addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");

  const summary = sourceValidationSummary(dossier);
  assert.deepEqual(summary.unresolvedFields, [field]);
  assert.equal(summary.exportReady, false);
  assert.equal(summary.fields[0].status, "unresolved");
});

test("taxateur kiest expliciet 2063 Wp en de waarde propageert naar dossier en exports", () => {
  const dossier = emptyDossier();
  const first = addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");
  addSolarValue(dossier, 1898, "opnameverslag.pdf", "2026-07-21T08:01:00.000Z");

  const result = confirmSourceValue(dossier, field, {
    sourceValueId: first.field.sourceValues[0].id,
  }, {
    actor: "taxateur@devreemakelaardij.nl",
    now: "2026-07-21T09:00:00.000Z",
    note: "Gecontroleerd op het actuele energielabel",
  });

  assert.equal(result.field.status, "confirmed");
  assert.equal(result.field.taxateur_bevestigd?.value, 2063);
  assert.equal((dossier.object as { zonnepanelen: { vermogen_wp: number } }).zonnepanelen.vermogen_wp, 2063);
  assert.equal(
    (dossier.energetische_opnamestaat as { items: { 24: { aantal_of_wattpiek: number; aantal_of_wattpiek_type: number } } })
      .items[24].aantal_of_wattpiek,
    2063
  );
  assert.equal(
    (dossier.energetische_opnamestaat as { items: { 24: { aantal_of_wattpiek_type: number } } })
      .items[24].aantal_of_wattpiek_type,
    0
  );
  assert.equal(
    (dossier.exports as { bevestigde_bronwaarden: { zonnepanelen_vermogen_wp: number } })
      .bevestigde_bronwaarden.zonnepanelen_vermogen_wp,
    2063
  );
  assert.equal(sourceValidationSummary(dossier).exportReady, true);
  assert.doesNotThrow(() => assertSourceValuesReadyForExport(dossier));
  assert.equal(dossier.audit_log?.at(-1)?.action, "source_value_confirmed");
  assert.equal(dossier.audit_log?.at(-1)?.actor, "taxateur@devreemakelaardij.nl");
});

test("taxateur kan een handmatige waarde invoeren met volledige audit trail", () => {
  const dossier = emptyDossier();
  addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");
  addSolarValue(dossier, 1898, "opnameverslag.pdf", "2026-07-21T08:01:00.000Z");

  const result = confirmSourceValue(dossier, field, { manualValue: "2100 Wp" }, {
    actor: "taxateur@devreemakelaardij.nl",
    now: "2026-07-21T09:00:00.000Z",
    note: "Factuur en paneeltype ter plaatse gecontroleerd",
  });

  assert.equal(result.field.taxateur_bevestigd?.method, "manual");
  assert.equal(result.field.taxateur_bevestigd?.value, 2100);
  assert.equal(result.field.taxateur_bevestigd?.note, "Factuur en paneeltype ter plaatse gecontroleerd");
});

test("nieuwe afwijkende bronwaarde na bevestiging opent het conflict opnieuw", () => {
  const dossier = emptyDossier();
  const first = addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");
  confirmSourceValue(dossier, field, { sourceValueId: first.field.sourceValues[0].id }, {
    actor: "taxateur@devreemakelaardij.nl",
    now: "2026-07-21T09:00:00.000Z",
  });

  addSolarValue(dossier, 1898, "nieuwe-opnamestaat.pdf", "2026-07-21T10:00:00.000Z");

  const state = dossier.bronwaarde_validatie?.fields[field];
  assert.equal(state?.status, "conflict");
  assert.equal(state?.taxateur_bevestigd?.active, false);
  assert.match(state?.taxateur_bevestigd?.invalidatedReason || "", /nieuwe afwijkende bronwaarde/);
  assert.equal((dossier.object as { zonnepanelen: { vermogen_wp: null } }).zonnepanelen.vermogen_wp, null);
  assert.equal(
    (dossier.energetische_opnamestaat as { items: { 24: { aantal_of_wattpiek: null } } })
      .items[24].aantal_of_wattpiek,
    null
  );
  assert.equal(
    (dossier.exports as { bevestigde_bronwaarden: { zonnepanelen_vermogen_wp: null } })
      .bevestigde_bronwaarden.zonnepanelen_vermogen_wp,
    null
  );
  assert.throws(() => assertSourceValuesReadyForExport(dossier), /Export geblokkeerd/);
  assert.equal(dossier.audit_log?.at(-1)?.action, "taxateur_confirmation_invalidated");
});

test("dezelfde bronwaarde is idempotent en maakt geen dubbele waarneming", () => {
  const dossier = emptyDossier();
  const first = addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");
  const second = addSolarValue(dossier, 2063, "energielabel.pdf", "2026-07-21T08:00:00.000Z");

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.field.sourceValues.length, 1);
  assert.equal(dossier.audit_log?.length, 1);
});

test("generieke vergelijkingsregels ondersteunen tolerantie en tekstnormalisatie", () => {
  assert.equal(sourceValuesEqual(100, 100.4, { type: "number", absoluteTolerance: 0.5 }), true);
  assert.equal(sourceValuesEqual(100, 101, { type: "number", relativeTolerance: 0.02 }), true);
  assert.equal(sourceValuesEqual("  Vol eigendom ", "vol   eigendom", { type: "text" }), true);
  assert.equal(normalizeSourceValue("2.063 Wp", { type: "number", integer: true }), 2063);
  assert.equal(normalizeSourceValue("ja", { type: "boolean" }), true);
  assert.equal(normalizeSourceValue("21-07-2026", { type: "date" }), "2026-07-21");
});
