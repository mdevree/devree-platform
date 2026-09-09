import { test } from "node:test";
import assert from "node:assert/strict";
import { saveEditedFollowUpDraft, sendEditedFollowUpDraft } from "./followUpDraftActions";

test("direct verzenden wacht op opslaan en verstuurt de aangepaste tekst", async () => {
  let storedBody = "Oorspronkelijk bericht";
  let sentBody: string | undefined;
  const calls: string[] = [];
  const saved = Promise.withResolvers<void>();
  const editedBody = "Aangepast bericht\nMet vriendelijke groet";
  const sending = sendEditedFollowUpDraft(async (url, options) => {
    calls.push(options.method!);
    if (options.method === "PATCH") {
      assert.equal(url, "/api/ai/follow-up-drafts/test-draft");
      await saved.promise;
      storedBody = JSON.parse(options.body as string).body;
    } else {
      assert.equal(url, "/api/ai/follow-up-drafts/test-draft/send");
      sentBody = storedBody;
    }
  }, "test-draft", editedBody);
  await Promise.resolve();
  assert.deepEqual(calls, ["PATCH"]);
  assert.equal(sentBody, undefined);
  saved.resolve();
  await sending;
  assert.deepEqual(calls, ["PATCH", "POST"]);
  assert.equal(sentBody, editedBody);
});

test("mislukt opslaan voorkomt verzending van het oude bericht", async () => {
  const calls: string[] = [];
  await assert.rejects(sendEditedFollowUpDraft(async (_url, options) => {
    calls.push(options.method!);
    throw new Error("Opslaan mislukt");
  }, "test-draft", "Gewijzigd"), /Opslaan mislukt/);
  assert.deepEqual(calls, ["PATCH"]);
});

test("leeg gemaakt concept valt niet terug op de oorspronkelijke tekst", async () => {
  for (const action of [saveEditedFollowUpDraft, sendEditedFollowUpDraft]) {
    for (const body of ["", " \n "]) {
      await assert.rejects(action(async () => {
        assert.fail("Lege berichten mogen geen verzoek starten");
      }, "test-draft", body), /Vul een bericht in/);
    }
  }
});
