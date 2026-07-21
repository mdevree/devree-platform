import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  createDebiteurenSharedLoginUrl,
  searchDebiteurenKlanten,
} from "./debiteuren";

const ENV_KEYS = [
  "DEBITEUREN_API_URL",
  "NEXT_PUBLIC_DEBITEUREN_URL",
  "DEBITEUREN_API_TOKEN",
  "DEBITEUREN_READ_API_TOKEN",
  "DEBITEUREN_WRITE_API_TOKEN",
  "DEBITEUREN_SSO_SECRET",
] as const;

function snapshotEnvironment() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("shared login gebruikt alleen het afzonderlijke SSO-geheim", () => {
  const snapshot = snapshotEnvironment();
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_READ_API_TOKEN = "read-secret";
    process.env.DEBITEUREN_SSO_SECRET = "sso-secret";

    const url = new URL(createDebiteurenSharedLoginUrl({
      userId: "user-1",
      name: "Test Gebruiker",
      returnTo: "/?page=facturen",
    }));
    const [payload, signature] = (url.searchParams.get("token") || "").split(".");

    assert.ok(payload);
    assert.equal(
      signature,
      crypto.createHmac("sha256", "sso-secret").update(payload).digest("base64url")
    );
    assert.notEqual(
      signature,
      crypto.createHmac("sha256", "read-secret").update(payload).digest("base64url")
    );
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("read-API gebruikt alleen de afzonderlijke read-header", async () => {
  const snapshot = snapshotEnvironment();
  const originalFetch = global.fetch;
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_READ_API_TOKEN = "read-secret";
    process.env.DEBITEUREN_SSO_SECRET = "sso-secret";

    global.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-Debiteuren-Read-Token"), "read-secret");
      assert.equal(headers.get("X-Debiteuren-Api-Token"), null);
      return new Response(JSON.stringify({ klanten: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await searchDebiteurenKlanten("test");
    assert.deepEqual(result, { klanten: [] });
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(snapshot);
  }
});

test("het oude gedeelde token is geen configuratiefallback", () => {
  const snapshot = snapshotEnvironment();
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_API_TOKEN = "legacy-secret";
    delete process.env.DEBITEUREN_SSO_SECRET;

    assert.throws(
      () => createDebiteurenSharedLoginUrl({ userId: "user-1", name: "Test" }),
      /shared login is niet geconfigureerd/
    );
  } finally {
    restoreEnvironment(snapshot);
  }
});
