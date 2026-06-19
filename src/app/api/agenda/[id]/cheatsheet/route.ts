import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";
const DEFAULT_GOTENBERG_URL = "http://127.0.0.1:3050";

function formatAmsterdamLabel(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: AMSTERDAM_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function slugPart(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function encodeWebDavPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

async function ensureNextcloudDirectory(
  nextcloudUrl: string,
  user: string,
  authHeader: string,
  remoteDir: string
) {
  const parts = remoteDir.split("/").filter(Boolean);
  let current = "";

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const url = `${nextcloudUrl}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeWebDavPath(current)}`;
    const res = await fetch(url, {
      method: "MKCOL",
      headers: { Authorization: authHeader },
    });

    if (![201, 405].includes(res.status)) {
      throw new Error(`Nextcloud map aanmaken mislukt (${res.status}) voor ${current}`);
    }
  }
}

async function createNextcloudShareUrl(
  nextcloudUrl: string,
  authHeader: string,
  remotePath: string
): Promise<string | null> {
  const res = await fetch(
    `${nextcloudUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "OCS-APIRequest": "true",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        path: `/${remotePath}`,
        shareType: "3",
        permissions: "1",
      }),
    }
  );

  if (!res.ok) {
    console.warn("Nextcloud share-link aanmaken mislukt:", res.status, await res.text());
    return null;
  }

  const data: { ocs?: { data?: { url?: string } } } | null = await res
    .json()
    .catch(() => null);
  return data?.ocs?.data?.url ?? null;
}

async function renderPdf(html: string): Promise<Buffer> {
  const gotenbergUrl = (process.env.GOTENBERG_URL || DEFAULT_GOTENBERG_URL).replace(/\/$/, "");
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");

  const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Gotenberg PDF-generatie mislukt (${res.status}): ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function uploadToNextcloud(filename: string, pdf: Buffer) {
  const nextcloudUrl = process.env.NEXTCLOUD_URL?.replace(/\/$/, "");
  const user = process.env.NEXTCLOUD_USER;
  const password = process.env.NEXTCLOUD_APP_PASSWORD;
  const basePath = process.env.NEXTCLOUD_BASE_PATH || "Bezichtigingen";

  if (!nextcloudUrl || !user || !password) {
    throw new Error("Nextcloud configuratie ontbreekt voor cheatsheet upload");
  }

  const authHeader = basicAuth(user, password);
  const remoteDir = `${basePath}/gegenereerd`;
  const remotePath = `${remoteDir}/${filename}`;

  await ensureNextcloudDirectory(nextcloudUrl, user, authHeader, remoteDir);

  const uploadUrl = `${nextcloudUrl}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeWebDavPath(remotePath)}`;
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/pdf",
    },
    body: new Uint8Array(pdf),
  });

  if (!res.ok) {
    throw new Error(`Nextcloud upload mislukt (${res.status}): ${await res.text()}`);
  }

  return {
    path: remotePath,
    url: await createNextcloudShareUrl(nextcloudUrl, authHeader, remotePath),
  };
}

async function readHtmlResponse(res: Response): Promise<string> {
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = JSON.parse(text);
    if (typeof data.html === "string") return data.html;
    if (typeof data.data?.html === "string") return data.data.html;
  }

  if (text.trim().startsWith("{")) {
    const data = JSON.parse(text);
    if (typeof data.html === "string") return data.html;
    if (typeof data.data?.html === "string") return data.data.html;
  }

  return text;
}

/**
 * POST /api/agenda/[id]/cheatsheet
 *
 * Triggert de cheat-sheet-flow: vraagt n8n om de voorbereidings-HTML, rendert
 * die via Gotenberg naar PDF en slaat de PDF op in Nextcloud. Na de afspraak
 * verwerkt een aparte n8n-flow de geannoteerde versie via OCR terug.
 *
 * Niet-blokkerend patroon zoals CALL_NOTE_WEBHOOK_URL: een ontbrekende of
 * mislukte webhook levert een duidelijke status, geen harde 500.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;

  const afspraak = await prisma.agendaAfspraak.findUnique({ where: { id } });
  if (!afspraak) {
    return NextResponse.json({ error: "Afspraak niet gevonden" }, { status: 404 });
  }

  const webhookUrl = process.env.CHEATSHEET_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "CHEATSHEET_WEBHOOK_URL niet geconfigureerd" },
      { status: 503 }
    );
  }

  // Absolute URL naar het context-endpoint dat n8n ophaalt om de PDF te renderen.
  const base =
    process.env.PLATFORM_BASE_URL || req.nextUrl.origin;
  const contextUrl = `${base}/api/agenda/${id}/context`;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify({
        afspraakId: id,
        systemid: afspraak.systemid,
        mauticContactId: afspraak.mauticContactId,
        contactNaam: afspraak.contactNaam,
        agbegin: afspraak.agbegin,
        agbeginLokaal: formatAmsterdamLabel(afspraak.agbegin),
        contextUrl,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n weigerde de aanvraag: ${res.status}` },
        { status: 502 }
      );
    }

    const html = await readHtmlResponse(res);
    if (!html.includes("<html")) {
      throw new Error("n8n gaf geen HTML terug voor de cheatsheet");
    }

    const pdf = await renderPdf(html);
    const datePart = afspraak.agbegin
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: AMSTERDAM_TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(afspraak.agbegin)
      : "onbekend";
    const timePart = afspraak.agbegin
      ? new Intl.DateTimeFormat("nl-NL", {
          timeZone: AMSTERDAM_TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(afspraak.agbegin)
          .replace(":", "")
      : "tijd";
    const filename = `${datePart}_${timePart}_${slugPart(afspraak.contactNaam) || "kijker"}_${id}.pdf`;
    const uploaded = await uploadToNextcloud(filename, pdf);

    await prisma.agendaAfspraak.update({
      where: { id },
      data: {
        cheatsheetStatus: "gegenereerd",
        cheatsheetPath: uploaded.path,
        cheatsheetUrl: uploaded.url,
        cheatsheetGeneratedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Cheat-sheet webhook fout:", err);
    return NextResponse.json(
      { error: "Kon cheat-sheet niet genereren" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, afspraakId: id });
}
