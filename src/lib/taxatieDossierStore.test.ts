import assert from "node:assert/strict";
import test from "node:test";
import { createInitialTaxatieDossier, resolveTaxatieDossierPath, type TaxatieDossierProject } from "./taxatieDossierStore";

const project: TaxatieDossierProject = {
  id: "project-1",
  name: "Taxatie Oostkade 4",
  type: "TAXATIE",
  projectStatus: "ACTIEF",
  status: "actief",
  address: null,
  woningAdres: "Oostkade 4",
  woningPostcode: "3221 AJ",
  woningPlaats: "Hellevoetsluis",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  createdAt: "2026-06-01T10:00:00.000Z",
};

test("leidt dossierpad bij voorkeur af van een bestaand taxatiemailpad", () => {
  const path = resolveTaxatieDossierPath(project, [
    "2026/Oostkade 4 3221 AJ Hellevoetsluis/2 Rechercheren/energielabel.pdf",
  ]);
  assert.equal(path, "2026/Oostkade 4 3221 AJ Hellevoetsluis/dossier.json");
});

test("maakt een backwards-compatible initieel dossier met audit_log", () => {
  const path = "2026/Oostkade 4 3221 AJ Hellevoetsluis/dossier.json";
  const dossier = createInitialTaxatieDossier(project, path, "2026-07-21T08:00:00.000Z");

  assert.deepEqual(dossier.audit_log, []);
  assert.equal((dossier.meta as Record<string, unknown>).nextcloud_pad, `/${path}`);
  assert.equal((dossier.object as Record<string, unknown>).adres, "Oostkade 4");
});
