import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";

for (const kind of ["zaken", "vragen"] as const) test(`${kind} extension captures without replay, waits for HTTP success and retries safely`, async () => {
  const prefix = kind === "zaken" ? "rw_lvz_outbox_" : "rw_vl_outbox_";
  const listeners: Record<string, (d: Record<string, unknown>) => Promise<void> | void> = {};
  const local: Record<string, unknown> = {}, session: Record<string, unknown> = {};
  const storage = (data: Record<string, unknown>) => ({
    async set(d: Record<string, unknown>) { Object.assign(data, d); },
    async get(k: string | null) { return k === null ? { ...data } : { [k]: data[k] }; },
    async remove(k: string) { delete data[k]; },
  });
  const listener = (key: string) => ({ addListener(fn: typeof listeners[string]) { listeners[key] = fn; } });
  const sent: { url: string; body: string }[] = [];
  let fail = true;
  const raw = new URLSearchParams({ objectcode: "SE11899", vllisnr: "SE11899", answer_501: "1", answer_501__MASK: "0;Nee|1;Ja", parta_123: "Private", _systemid: "1786541", oven: "1", oven__MASK: "1;Blijft achter", CSRFToken: "secret", verkoper_result: "Private" }).toString();
  vm.runInNewContext(fs.readFileSync(kind === "zaken" ? "browserext/lijst-van-zaken.js" : "browserext/vragenlijst.js", "utf8"), {
    chrome: { webRequest: { onBeforeRequest: listener("before"), onCompleted: listener("complete"), onErrorOccurred: listener("error") }, storage: { local: storage(local), session: storage(session) }, alarms: { create() {}, onAlarm: listener("alarm") } },
    bodyFromWebRequest: () => raw, loadWebhookSecret: async () => "test", crypto: { randomUUID: () => "test-capture-id" },
    URLSearchParams, AbortSignal, console: { log() {}, warn() {} },
    fetch: async (url: string, options: { body: string }) => { sent.push({ url, body: options.body }); return { ok: !fail, status: fail ? 503 : 200, json: async () => fail ? {} : { ok: true, items: 1 } }; },
  });
  await listeners.before({ requestId: "1", method: "POST" });
  assert.equal(sent.length, 0);
  await listeners.complete({ requestId: "1", statusCode: 500 });
  assert.equal(sent.length, 0);
  await listeners.before({ requestId: "2", method: "POST" });
  await listeners.complete({ requestId: "2", statusCode: 200 });
  assert.equal(sent.length, 1);
  assert.ok(local[prefix + "test-capture-id"]);
  assert.ok(!sent[0].body.includes("secret"));
  assert.ok(!sent[0].body.includes("Private"));
  assert.ok(sent[0].url.startsWith("https://kantoor.devreemakelaardij.nl/"));
  fail = false;
  await listeners.alarm({ name: kind === "zaken" ? "realworks-lijst-van-zaken" : "realworks-vragenlijst" });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].body, sent[0].body);
  assert.equal(local[prefix + "test-capture-id"], undefined);
});
