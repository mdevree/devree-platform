import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  createDebiteurenSharedLoginUrl,
  createDebiteurenInvoice,
  getDebiteurenInvoice,
  previewDebiteurenInvoice,
  searchDebiteurenKlanten,
  upsertDebiteurenCustomerFromContact,
  type DebiteurenInvoiceCreateV1,
} from "./debiteuren";
import type { ContactV1 } from "./contracts/contactV1";

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

test("write-API gebruikt POST met write-token en actor", async () => {
  const snapshot = snapshotEnvironment();
  const originalFetch = global.fetch;
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_READ_API_TOKEN = "read-secret";
    process.env.DEBITEUREN_WRITE_API_TOKEN = "write-secret";

    const contact: ContactV1 = {
      contractVersion: "ContactV1",
      source: "mautic",
      mauticContactId: 123,
      aanhef: null,
      initialen: "T.",
      voornamen: "Test",
      voornaam: "Test",
      tussenvoegsel: null,
      achternaam: "Relatie",
      email: "test@example.invalid",
      mobiel: null,
      telefoon: null,
      straat: "Dorpsstraat",
      huisnummer: "12",
      toevoeging: null,
      aanvullendeAdresregel: null,
      postcode: "1234 AB",
      plaats: "Rotterdam",
      land: "Nederland",
      partner: null,
      normalizationWarnings: [],
    };

    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);

      assert.equal(init?.method, "POST");
      assert.equal(url.searchParams.get("page"), "api");
      assert.equal(url.searchParams.get("resource"), "v1/customers/by-mautic/123");
      assert.equal(headers.get("X-Debiteuren-Write-Token"), "write-secret");
      assert.equal(headers.get("X-Debiteuren-Actor"), "melvin@example.invalid");
      assert.equal(headers.get("X-Debiteuren-Read-Token"), null);
      assert.deepEqual(JSON.parse(String(init?.body)), contact);

      return new Response(JSON.stringify({
        result: "created",
        customer: { id: 456, mauticContactId: 123, source: "mautic" },
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await upsertDebiteurenCustomerFromContact(contact, "melvin@example.invalid");
    assert.equal(result.customer?.id, 456);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(snapshot);
  }
});

test("invoice-preview gebruikt write-token maar geen idempotency-key", async () => {
  const snapshot = snapshotEnvironment();
  const originalFetch = global.fetch;
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_WRITE_API_TOKEN = "write-secret";

    const payload: DebiteurenInvoiceCreateV1 = {
      contractVersion: "InvoiceCreateV1",
      source: "devree-platform",
      customerId: 456,
      invoiceType: "taxatie",
      subject: "Taxatie Voorbeeldstraat 1",
      invoiceDate: null,
      dueDate: null,
      bank: "rabo",
      lines: [{ description: "Taxatierapport", amountExcl: 650, vatRate: 0.21 }],
      extra: null,
      reference: { platformProjectId: "project-1", mauticContactId: 123 },
    };

    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);

      assert.equal(init?.method, "POST");
      assert.equal(url.searchParams.get("resource"), "v1/invoices/preview");
      assert.equal(headers.get("X-Debiteuren-Write-Token"), "write-secret");
      assert.equal(headers.get("X-Debiteuren-Actor"), "melvin@example.invalid");
      assert.equal(headers.get("X-Debiteuren-Idempotency-Key"), null);
      assert.deepEqual(JSON.parse(String(init?.body)), payload);

      return new Response(JSON.stringify({
        result: "preview",
        invoice: { amountExcl: 650, amountIncl: 786.5 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await previewDebiteurenInvoice(payload, "melvin@example.invalid");
    assert.equal(result.result, "preview");
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(snapshot);
  }
});

test("invoice-create stuurt stabiele idempotency-key mee", async () => {
  const snapshot = snapshotEnvironment();
  const originalFetch = global.fetch;
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_WRITE_API_TOKEN = "write-secret";

    const payload: DebiteurenInvoiceCreateV1 = {
      contractVersion: "InvoiceCreateV1",
      source: "devree-platform",
      customerId: 456,
      invoiceType: "taxatie",
      subject: "Taxatie Voorbeeldstraat 1",
      invoiceDate: "2026-07-21",
      dueDate: null,
      bank: "rabo",
      lines: [{ description: "Taxatierapport", amountExcl: 650, vatRate: 0.21 }],
      extra: null,
      reference: { platformProjectId: "project-1", mauticContactId: 123 },
    };

    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);

      assert.equal(url.searchParams.get("resource"), "v1/invoices");
      assert.equal(headers.get("X-Debiteuren-Idempotency-Key"), "project-1:taxatie:v1");
      assert.equal(headers.get("X-Debiteuren-Read-Token"), null);

      return new Response(JSON.stringify({
        result: "created",
        invoice: { id: 789, invoiceNumber: 2026001, customerId: 456 },
      }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createDebiteurenInvoice(payload, "melvin@example.invalid", "project-1:taxatie:v1");
    assert.equal(result.result, "created");
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(snapshot);
  }
});

test("invoice-read gebruikt read-token en InvoiceReadV1 resource", async () => {
  const snapshot = snapshotEnvironment();
  const originalFetch = global.fetch;
  try {
    process.env.DEBITEUREN_API_URL = "https://debiteuren.example.test";
    process.env.DEBITEUREN_READ_API_TOKEN = "read-secret";

    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);

      assert.equal(init?.method, undefined);
      assert.equal(url.searchParams.get("resource"), "v1/invoices/789");
      assert.equal(headers.get("X-Debiteuren-Read-Token"), "read-secret");
      assert.equal(headers.get("X-Debiteuren-Write-Token"), null);

      return new Response(JSON.stringify({
        result: "ok",
        invoice: {
          id: 789,
          factuurnummer: 2026001,
          betreft: "Taxatie",
          datum: "2026-07-21",
          vervaldatum: "2026-08-04",
          betaaldOp: null,
          bedragIncl: 786.5,
          bedragExcl: 650,
          betaald: false,
          verlopen: false,
          status: "open",
          score: null,
          hash: "abc123",
          herinneringen: { herinnering1: null, herinnering2: null, laatsteAanmaning: null },
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await getDebiteurenInvoice(789);
    assert.equal(result.invoice?.status, "open");
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
