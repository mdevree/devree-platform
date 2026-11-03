import assert from "node:assert/strict";
import test from "node:test";
import { reusePropertyBriefing, type CachedBriefing } from "./propertyBriefingCache";
test("unchanged saves and PDF reads reuse persistent summary; changed answers rebuild", async () => {
 const rows = new Map<string, CachedBriefing<{ builds: number }>>();
 let builds = 0;
 const storage = { read: async (key: string) => rows.get(key) || null, write: async (key: string, value: CachedBriefing<{ builds: number }>) => { rows.set(key, value); return value; } };
 const first = await reusePropertyBriefing("vragen", { answer_501: "1", changedbycustomer: "yesterday" }, storage, () => ({ builds: ++builds }));
 const repeated = await reusePropertyBriefing("vragen", { changedbycustomer: "today", answer_501: "1" }, storage, () => ({ builds: ++builds }));
 assert.deepEqual(repeated, first);
 assert.equal(builds, 1);
 const changed = await reusePropertyBriefing("vragen", { answer_501: "0" }, storage, () => ({ builds: ++builds }));
 assert.equal(builds, 2);
 assert.notEqual(changed.contentHash, first.contentHash);
 const reverted = await reusePropertyBriefing("vragen", { answer_501: "1" }, storage, () => ({ builds: ++builds }));
 assert.deepEqual(reverted, first);
 assert.equal(builds, 2);
});
