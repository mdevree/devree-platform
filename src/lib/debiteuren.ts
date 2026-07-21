import crypto from "crypto";
import type { ContactV1 } from "./contracts/contactV1";

type DebiteurenKlant = {
  id: number;
  naam: string;
  email: string | null;
  telefoon: string | null;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
};

type DebiteurenFactuur = {
  id: number;
  factuurnummer: number;
  betreft: string;
  datum: string | null;
  vervaldatum: string | null;
  betaaldOp: string | null;
  bedragIncl: number;
  bedragExcl: number;
  betaald: boolean;
  verlopen: boolean;
  score: number | null;
  hash: string | null;
  herinneringen: {
    herinnering1: string | null;
    herinnering2: string | null;
    laatsteAanmaning: string | null;
  };
};

export type DebiteurenSearchResponse = {
  klanten: DebiteurenKlant[];
};

export type DebiteurenSummaryResponse = {
  klant: DebiteurenKlant;
  samenvatting: {
    openstaandBedrag: number;
    verlopenBedrag: number;
    openFacturen: number;
    verlopenFacturen: number;
    laatsteFacturen: DebiteurenFactuur[];
  };
};

export type DebiteurenCustomerUpsertResponse = {
  result: "existing" | "linked" | "created" | "review_required" | "validation_failed";
  customer: {
    id: number;
    mauticContactId: number | null;
    source: string | null;
  } | null;
  errors?: string[];
  reason?: string;
  candidateIds?: number[];
};

export type DebiteurenInvoiceLine = {
  description: string;
  amountExcl: number;
  vatRate: number;
};

export type DebiteurenInvoiceCreateV1 = {
  contractVersion: "InvoiceCreateV1";
  source: "devree-platform";
  customerId: number;
  invoiceType: "taxatie" | "verkoop" | "aankoop" | "overig";
  subject: string;
  invoiceDate: string | null;
  dueDate: string | null;
  bank: "rabo" | "abn";
  lines: DebiteurenInvoiceLine[];
  extra: string | null;
  reference: {
    platformProjectId: string | null;
    mauticContactId: number | null;
  } | null;
};

export type DebiteurenInvoicePreview = {
  customerId: number;
  customerName: string;
  addressBlock: string;
  subject: string;
  invoiceType: string;
  invoiceDate: string;
  dueDate: string;
  bank: string;
  paymentTerms: string;
  extra: string | null;
  lines: Array<DebiteurenInvoiceLine & {
    vatAmount: number;
    amountIncl: number;
  }>;
  amountExcl: number;
  amountIncl: number;
};

export type DebiteurenInvoiceResponse = {
  result: "preview" | "created" | "existing" | "validation_failed" | "idempotency_conflict" | "processing" | "not_found";
  invoice: DebiteurenInvoicePreview | {
    id: number;
    invoiceNumber: number;
    customerId: number;
    subject: string;
    invoiceDate: string | null;
    dueDate: string | null;
    amountExcl: number;
    amountIncl: number;
    hash: string | null;
  } | null;
  errors?: string[];
};

class DebiteurenApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function getDebiteurenBaseUrl() {
  const baseUrl = process.env.DEBITEUREN_API_URL || process.env.NEXT_PUBLIC_DEBITEUREN_URL;

  if (!baseUrl) {
    throw new DebiteurenApiError("Debiteuren basis-URL is niet geconfigureerd", 503);
  }

  return baseUrl.replace(/\/$/, "");
}

function getDebiteurenReadConfig() {
  const token = process.env.DEBITEUREN_READ_API_TOKEN;
  if (!token) {
    throw new DebiteurenApiError("Debiteuren read-API is niet geconfigureerd", 503);
  }

  return { baseUrl: getDebiteurenBaseUrl(), token };
}

function getDebiteurenWriteConfig() {
  const token = process.env.DEBITEUREN_WRITE_API_TOKEN;
  if (!token) {
    throw new DebiteurenApiError("Debiteuren write-API is niet geconfigureerd", 503);
  }

  return { baseUrl: getDebiteurenBaseUrl(), token };
}

function getDebiteurenSsoConfig() {
  const secret = process.env.DEBITEUREN_SSO_SECRET;
  if (!secret) {
    throw new DebiteurenApiError("Debiteuren shared login is niet geconfigureerd", 503);
  }

  return { baseUrl: getDebiteurenBaseUrl(), secret };
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createDebiteurenSharedLoginUrl({
  userId,
  name,
  email,
  returnTo = "/",
}: {
  userId: string;
  name: string;
  email?: string | null;
  returnTo?: string;
}) {
  const { baseUrl, secret } = getDebiteurenSsoConfig();
  const now = Math.floor(Date.now() / 1000);
  const safeReturnTo = sanitizeDebiteurenReturnTo(returnTo);
  const payload = base64UrlEncode(JSON.stringify({
    v: 1,
    iss: "devree-platform",
    sub: userId,
    name,
    email: email || null,
    iat: now,
    exp: now + 60,
    nonce: crypto.randomBytes(18).toString("base64url"),
    returnTo: safeReturnTo,
  }));
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const url = new URL(baseUrl);
  url.searchParams.set("page", "platform-login");
  url.searchParams.set("token", `${payload}.${signature}`);

  return url.toString();
}

async function debiteurenGet<T>(resource: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const { baseUrl, token } = getDebiteurenReadConfig();
  const url = new URL(baseUrl);
  url.searchParams.set("page", "api");
  url.searchParams.set("resource", resource);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Debiteuren-Read-Token": token,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DebiteurenApiError(data?.error || "Debiteuren API fout", response.status);
  }

  return data as T;
}

async function debiteurenPost<T>(
  resource: string,
  body: unknown,
  actor: string,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const { baseUrl, token } = getDebiteurenWriteConfig();
  const url = new URL(baseUrl);
  url.searchParams.set("page", "api");
  url.searchParams.set("resource", resource);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Debiteuren-Write-Token": token,
      "X-Debiteuren-Actor": actor,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data?.errors)
      ? data.errors.join("; ")
      : data?.error || data?.reason || "Debiteuren API fout";
    throw new DebiteurenApiError(message, response.status);
  }

  return data as T;
}

export async function searchDebiteurenKlanten(query: string, limit = 8) {
  return debiteurenGet<DebiteurenSearchResponse>("klanten/search", {
    q: query,
    limit,
  });
}

export async function getDebiteurenFactuurSamenvatting(klantId: number) {
  return debiteurenGet<DebiteurenSummaryResponse>("klanten/factuur-samenvatting", {
    klant_id: klantId,
  });
}

export async function upsertDebiteurenCustomerFromContact(contact: ContactV1, actor: string) {
  return debiteurenPost<DebiteurenCustomerUpsertResponse>(
    `v1/customers/by-mautic/${contact.mauticContactId}`,
    contact,
    actor
  );
}

export async function previewDebiteurenInvoice(payload: DebiteurenInvoiceCreateV1, actor: string) {
  return debiteurenPost<DebiteurenInvoiceResponse>("v1/invoices/preview", payload, actor);
}

export async function createDebiteurenInvoice(payload: DebiteurenInvoiceCreateV1, actor: string, idempotencyKey: string) {
  return debiteurenPost<DebiteurenInvoiceResponse>("v1/invoices", payload, actor, {
    "X-Debiteuren-Idempotency-Key": idempotencyKey,
  });
}

export function getDebiteurenPublicUrl(path = "") {
  const baseUrl = process.env.NEXT_PUBLIC_DEBITEUREN_URL || process.env.DEBITEUREN_API_URL || "";
  if (!baseUrl) return "";
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function getDebiteurenSharedLoginPath(returnTo = "/") {
  return `/api/debiteuren/login?returnTo=${encodeURIComponent(sanitizeDebiteurenReturnTo(returnTo))}`;
}

function sanitizeDebiteurenReturnTo(returnTo: string) {
  if (!returnTo || returnTo.includes("://") || returnTo.startsWith("//")) {
    return "/";
  }

  if (returnTo.startsWith("/") || returnTo.startsWith("?")) {
    return returnTo;
  }

  return "/";
}

export function isDebiteurenApiError(error: unknown): error is DebiteurenApiError {
  return error instanceof DebiteurenApiError;
}
