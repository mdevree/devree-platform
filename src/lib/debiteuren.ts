import crypto from "crypto";

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

class DebiteurenApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function getDebiteurenConfig() {
  const baseUrl = process.env.DEBITEUREN_API_URL || process.env.NEXT_PUBLIC_DEBITEUREN_URL;
  const token = process.env.DEBITEUREN_API_TOKEN;

  if (!baseUrl || !token) {
    throw new DebiteurenApiError("Debiteuren API is niet geconfigureerd", 503);
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token,
  };
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
  const { baseUrl, token } = getDebiteurenConfig();
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
  const signature = crypto.createHmac("sha256", token).update(payload).digest("base64url");
  const url = new URL(baseUrl);
  url.searchParams.set("page", "platform-login");
  url.searchParams.set("token", `${payload}.${signature}`);

  return url.toString();
}

async function debiteurenGet<T>(resource: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const { baseUrl, token } = getDebiteurenConfig();
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
      "X-Debiteuren-Api-Token": token,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DebiteurenApiError(data?.error || "Debiteuren API fout", response.status);
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
