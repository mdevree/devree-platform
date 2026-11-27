import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { DRAFTS_PATH } from "./whatsappDraftLinks";

const origin = "https://kantoor.devreemakelaardij.nl";
const worker = readFileSync(new URL("../../public/mobile/whatsapp-concepten-sw.js", import.meta.url), "utf8");

function loadWorker() {
  const handlers = new Map<string, (event: object) => void>();
  const shown: { title: string; options: NotificationOptions }[] = [];
  const opened: string[] = [];
  const self = {
    addEventListener: (name: string, handler: (event: object) => void) => handlers.set(name, handler),
    location: { origin },
    registration: { showNotification: async (title: string, options: NotificationOptions) => shown.push({ title, options }) },
    clients: {
      matchAll: async () => [{ url: `${origin}/overige-pagina` }],
      openWindow: async (target: string) => opened.push(target),
    },
  };
  runInNewContext(worker, { self, URL });
  async function fire(name: string, event: object) {
    let done: Promise<void> | undefined;
    handlers.get(name)?.({ ...event, waitUntil: (promise: Promise<void>) => { done = promise; } });
    assert.ok(done, `${name} must use waitUntil`);
    await done;
  }
  return { fire, handlers, shown, opened };
}

test("web push always displays a notification without caching any platform requests", async () => {
  const { fire, handlers, shown } = loadWorker();
  assert.equal(handlers.has("fetch"), false);
  await fire("push", { data: { json: () => ({ draft: "reply-test", body: "Sanne vraagt om een bezichtiging." }) } });
  await fire("push", { data: { json: () => ({ draft: null, body: "Webmeldingen staan aan op dit toestel." }) } });
  await fire("push", { data: { json: () => { throw new Error("invalid payload"); } } });

  assert.equal(shown.length, 3);
  assert.equal(shown[0].options.tag, "reply-test");
  assert.equal(shown[0].options.data.draft, "reply-test");
  assert.equal(shown[0].options.body, "Sanne vraagt om een bezichtiging.");
  assert.equal(shown[1].options.data.draft, null);
  assert.equal(shown[1].options.body, "Webmeldingen staan aan op dit toestel.");
  assert.equal(shown[2].options.data.draft, null);
  assert.equal(shown[2].options.body, "Er staat een WhatsApp-concept klaar.");
});

test("notification clicks keep recipients on an internal, validated draft URL", async () => {
  const { fire, opened } = loadWorker();
  let closed = 0;
  const close = () => { closed += 1; };
  await fire("notificationclick", { notification: { close, data: { draft: "followup-name" } } });
  await fire("notificationclick", { notification: { close, data: { draft: "reply-1&target=https://other.test" } } });
  await fire("notificationclick", { notification: { close, data: { draft: null } } });

  assert.equal(closed, 3);
  assert.deepEqual(opened, [
    `${origin}${DRAFTS_PATH}?draft=followup-name`, `${origin}${DRAFTS_PATH}`, `${origin}${DRAFTS_PATH}`,
  ]);
});
