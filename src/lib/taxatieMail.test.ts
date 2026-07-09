import test from "node:test";
import assert from "node:assert/strict";
import { classifyTaxatieMail, matchTaxatieMail, type TaxatieProjectForMatch } from "./taxatieMail";

const baseProject: TaxatieProjectForMatch = {
  id: "project-1",
  name: "Taxatie Oostkade 4 c4",
  type: "TAXATIE",
  projectStatus: "ACTIEF",
  status: "actief",
  address: null,
  woningAdres: "Oostkade 4 c4",
  woningPostcode: "3221AJ",
  woningPlaats: "Hellevoetsluis",
  contactName: "Jan Jansen",
  contactEmail: "jan@example.test",
  contactPhone: "0612345678",
  hypotheekAdviseur: { naam: "Piet Adviseur", bedrijf: "Financiering BV", email: null, telefoon: null },
};

test("matcht taxatiemail betrouwbaar op adres en postcode", () => {
  const result = matchTaxatieMail([baseProject], {
    messageId: "m1",
    mailbox: "info@devreemakelaardij.nl",
    from: "noreply@nwwi.nl",
    subject: "NWWI aanvraag Oostkade 4 c4 Hellevoetsluis",
    bodyText: "Object: Oostkade 4 c4, 3221 AJ Hellevoetsluis. Opdrachtgever jan@example.test",
  });

  assert.equal(result.status, "matched");
  assert.equal(result.selected?.projectId, "project-1");
  assert.equal(result.classification.targetSubfolder, "1 Contracteren");
  assert.equal(result.classification.suggestedProjectStatus, "ACTIEF");
});

test("matcht taxatieprojecten waarvan woningAdres al postcode en plaats bevat", () => {
  const project = {
    ...baseProject,
    woningAdres: "Oostkade 4 c4, 3221AJ HELLEVOETSLUIS",
    woningPostcode: "3221AJ",
    woningPlaats: "HELLEVOETSLUIS",
    contactEmail: "avonk39@hotmail.com",
  };

  const result = matchTaxatieMail([project, { ...baseProject, id: "project-2", woningAdres: "Repel 91 , 3224VE HELLEVOETSLUIS", contactEmail: null }], {
    messageId: "m1b",
    mailbox: "info@devreemakelaardij.nl",
    subject: "NWWI aanvraag Oostkade 4 c4 Hellevoetsluis",
    bodyText: "Object: Oostkade 4 c4, 3221 AJ Hellevoetsluis. Opdrachtgever avonk39@hotmail.com",
  });

  assert.equal(result.status, "matched");
  assert.equal(result.selected?.projectId, "project-1");
  assert.equal(result.selected?.nextcloudBasePath, "2026/Oostkade 4 c4, 3221AJ HELLEVOETSLUIS");
});

test("geeft ambiguous bij meerdere plausibele taxatieprojecten", () => {
  const other = {
    ...baseProject,
    id: "project-2",
    name: "Taxatie Oostkade 4 c5",
    woningAdres: "Oostkade 4 c5",
  };

  const result = matchTaxatieMail([baseProject, other], {
    messageId: "m2",
    mailbox: "info@devreemakelaardij.nl",
    subject: "Kadaster Oostkade Hellevoetsluis",
    bodyText: "Bijgaand kadastraal bericht voor 3221 AJ Hellevoetsluis. Opdrachtgever jan@example.test.",
  });

  assert.equal(result.status, "ambiguous");
  assert.equal(result.selected, null);
  assert.equal(result.candidates.length, 2);
});

test("geeft unmatched zonder betrouwbare projectscore", () => {
  const result = matchTaxatieMail([baseProject], {
    messageId: "m3",
    mailbox: "melvin@devreemakelaardij.nl",
    subject: "Kadaster onbekend adres",
    bodyText: "Bijlage voor Zuidstraat 10, 3201 AA Spijkenisse.",
  });

  assert.equal(result.status, "unmatched");
  assert.equal(result.selected, null);
});

test("slaat afgeronde en geannuleerde taxaties over", () => {
  const result = matchTaxatieMail([{ ...baseProject, projectStatus: "AFGEROND" }], {
    messageId: "m4",
    mailbox: "info@devreemakelaardij.nl",
    subject: "NWWI aanvraag Oostkade 4 c4",
    bodyText: "Object: Oostkade 4 c4, 3221 AJ Hellevoetsluis. jan@example.test",
  });

  assert.equal(result.status, "unmatched");
  assert.equal(result.candidates.length, 0);
});

test("classificeert Kadaster en rapportfase naar juiste submappen en checklist", () => {
  const kadaster = classifyTaxatieMail({
    subject: "Kadaster eigendomsinformatie",
    bodyText: "Eigendomsinformatie en akte van levering in de bijlage.",
  });
  assert.equal(kadaster.targetSubfolder, "2 Rechercheren");
  assert.ok(kadaster.checklistSignals.some((signal) => signal.key === "kadaster-opvragen"));
  assert.ok(kadaster.checklistSignals.some((signal) => signal.key === "akte"));

  const rapport = classifyTaxatieMail({
    subject: "Taxatierapport gevalideerd met nota",
    bodyText: "Het taxatierapport en de nota zijn beschikbaar.",
  });
  assert.equal(rapport.targetSubfolder, "5 Rapporteren & 6 Archiveren");
  assert.equal(rapport.suggestedProjectStatus, "RAPPORT_CONCEPT");
});
