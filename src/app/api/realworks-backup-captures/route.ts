import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-webhook-secret",
};

const MAX_RESPONSE_BODY_CHARS = 200000;

type RealworksNetworkCapture = {
  source?: string;
  captured_at?: string;
  page_url?: string;
  host?: string;
  path?: string;
  query?: string;
  hints?: string[];
  transport?: string;
  method?: string;
  url?: string;
  status?: number;
  content_type?: string;
  request_body_preview?: string;
  response_truncated?: boolean;
  response_body?: string;
  link_text?: string;
  link_target?: string;
  onclick_preview?: string;
  popup_target?: string;
  popup_features?: string;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401, headers: CORS_HEADERS });
  }

  const capture = await request.json() as RealworksNetworkCapture;
  if (!capture?.url || typeof capture.url !== "string") {
    return NextResponse.json({ error: "url is verplicht" }, { status: 400, headers: CORS_HEADERS });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(capture.url);
  } catch {
    return NextResponse.json({ error: "url is ongeldig" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!["backup.realworks.nl", "crm.realworks.nl"].includes(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: "Alleen Realworks hosts zijn toegestaan" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const normalizedCapture = {
    ...capture,
    received_at: new Date().toISOString(),
    host: parsedUrl.hostname,
    path: parsedUrl.pathname,
    query: parsedUrl.search,
    response_body: typeof capture.response_body === "string"
      ? capture.response_body.slice(0, MAX_RESPONSE_BODY_CHARS)
      : "",
  };

  console.log("[realworks-backup-capture]", {
    source: normalizedCapture.source,
    host: normalizedCapture.host,
    path: normalizedCapture.path,
    query: normalizedCapture.query,
    url: normalizedCapture.url,
    pageUrl: normalizedCapture.page_url,
    method: normalizedCapture.method,
    status: normalizedCapture.status,
    contentType: normalizedCapture.content_type,
    responseChars: normalizedCapture.response_body.length,
    truncated: normalizedCapture.response_truncated,
    transport: normalizedCapture.transport,
    linkText: "link_text" in normalizedCapture ? normalizedCapture.link_text : undefined,
    linkTarget: "link_target" in normalizedCapture ? normalizedCapture.link_target : undefined,
    popupTarget: "popup_target" in normalizedCapture ? normalizedCapture.popup_target : undefined,
    onclickPreview: "onclick_preview" in normalizedCapture ? normalizedCapture.onclick_preview : undefined,
  });

  const configuredWebhookUrl = process.env.REALWORKS_BACKUP_CAPTURE_WEBHOOK_URL;
  const n8nUrl = process.env.N8N_URL;
  const webhookUrl = configuredWebhookUrl
    || (n8nUrl ? `${n8nUrl.replace(/\/$/, "")}/webhook/realworks-backup-capture` : null);

  if (!webhookUrl) {
    return NextResponse.json(
      { success: true, forwarded: false, reason: "Geen capture webhook geconfigureerd" },
      { headers: CORS_HEADERS }
    );
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(normalizedCapture),
    });

    return NextResponse.json(
      { success: true, forwarded: res.ok, webhookStatus: res.status },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.warn("[realworks-backup-capture] webhook forward mislukt:", error);
    return NextResponse.json(
      { success: true, forwarded: false, error: "Webhook forward mislukt" },
      { headers: CORS_HEADERS }
    );
  }
}
