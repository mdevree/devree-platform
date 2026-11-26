import assert from "node:assert/strict";
import { test } from "node:test";
import { isWhatsAppDraftId, whatsappDraftLoginPath, whatsappDraftPath } from "./whatsappDraftLinks";

test("WhatsApp concept links accept typed IDs and stay on the platform", () => {
  assert.equal(whatsappDraftPath("reply-ab_12"), "/mobile/whatsapp-concepten?draft=reply-ab_12");
  assert.equal(whatsappDraftLoginPath("followup-ab12"), "/login?whatsappConcepten=1&whatsappConcept=followup-ab12");

  for (const invalid of ["//other.example", "reply-a&continue=//other.example", "reply-a/extra", "reply-", "office-a"]) {
    assert.equal(isWhatsAppDraftId(invalid), false);
    assert.equal(whatsappDraftPath(invalid), "/mobile/whatsapp-concepten");
  }
});
