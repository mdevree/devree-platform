import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDebiteurenControle,
  parseContactWarnings,
  projectMauticContactIds,
  type DebiteurenControleProject,
} from "./debiteurenControle";

const BASE_PROJECT: DebiteurenControleProject = {
  id: "project-1",
  name: "Taxatie Voorbeeldstraat 1",
  type: "TAXATIE",
  status: "lead",
  projectStatus: "ACTIEF",
  woningAdres: "Voorbeeldstraat 1",
  woningPostcode: "3011 AA",
  woningPlaats: "Rotterdam",
  mauticContactId: 123,
  updatedAt: new Date("2026-07-21T12:00:00Z"),
  contacts: [{ mauticContactId: 123, role: "opdrachtgever" }],
  debiteurenLink: null,
  debiteurenInvoices: [],
};

test("parseContactWarnings negeert ongeldige items en houdt meldingen over", () => {
  assert.deepEqual(parseContactWarnings([
    { code: "parsed_address1", field: "straat", message: "Adresregel opgesplitst" },
    { code: "empty", field: "straat", message: "" },
    null,
  ]), [
    { code: "parsed_address1", field: "straat", message: "Adresregel opgesplitst" },
  ]);
});

test("projectMauticContactIds dedupliceert legacy en projectcontacten", () => {
  assert.deepEqual(projectMauticContactIds({
    mauticContactId: 123,
    contacts: [
      { mauticContactId: 123, role: "opdrachtgever" },
      { mauticContactId: 456, role: "partner" },
    ],
  }), [123, 456]);
});

test("buildDebiteurenControle groepeert debiteurenrisico's", () => {
  const result = buildDebiteurenControle([
    BASE_PROJECT,
    {
      ...BASE_PROJECT,
      id: "project-2",
      name: "Taxatie Met Link",
      debiteurenLink: {
        id: "link-1",
        debiteurenKlantId: 789,
        klantNaam: "Test Klant",
        klantEmail: "test@example.invalid",
        klantAdres: "Voorbeeldstraat 1",
        mauticContactId: 123,
        contactWarnings: [{ code: "parsed_address1", field: "straat", message: "Adresregel opgesplitst" }],
        normalizationCheckedAt: new Date("2026-07-21T13:00:00Z"),
        linkedAt: new Date("2026-07-21T13:00:00Z"),
        lastCheckedAt: new Date("2026-07-21T13:00:00Z"),
      },
    },
    {
      ...BASE_PROJECT,
      id: "project-3",
      name: "Afgerond Project",
      projectStatus: "AFGEROND",
    },
  ]);

  assert.equal(result.summary.activeProjects, 2);
  assert.equal(result.summary.linkedProjects, 1);
  assert.equal(result.summary.unlinkedWithMautic, 1);
  assert.equal(result.summary.linksWithWarnings, 1);
  assert.equal(result.summary.taxatieReadyForInvoice, 1);
});
