import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsAppMessageId } from "./whatsapp-message-id";

test("send response and PN/LID webhook IDs identify the same WhatsApp message", () => {
  for (const id of ["ABC123", "true_123@lid_ABC123", "true_31612345678@c.us_ABC123", "false_31612345678@s.whatsapp.net_ABC123"]) {
    assert.equal(normalizeWhatsAppMessageId(id), "ABC123");
  }
  assert.equal(normalizeWhatsAppMessageId("unrelated_id_with_underscores"), "unrelated_id_with_underscores");
});
