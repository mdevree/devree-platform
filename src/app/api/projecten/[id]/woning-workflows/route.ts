import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

const WORKFLOW_PATHS = {
  aanmelding: "woning-aanmelding-platform",
  ai: "woning-ai-aanvullen-platform",
} as const;

type WorkflowAction = keyof typeof WORKFLOW_PATHS;

function workflowUrl(action: WorkflowAction): string | null {
  const n8nUrl = process.env.N8N_URL?.replace(/\/$/, "");
  if (!n8nUrl) return null;
  return `${n8nUrl}/webhook/${WORKFLOW_PATHS[action]}`;
}

function isWorkflowAction(value: unknown): value is WorkflowAction {
  return value === "aanmelding" || value === "ai";
}

async function postToN8n(url: string, body: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!isWorkflowAction(action)) {
    return NextResponse.json({ error: "Onbekende workflowactie" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      realworksId: true,
      woningAdres: true,
      woningPostcode: true,
      woningPlaats: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }
  if (!project.realworksId) {
    return NextResponse.json({ error: "Project heeft geen Realworks ID" }, { status: 400 });
  }

  const url = workflowUrl(action);
  if (!url) {
    return NextResponse.json({ error: "N8N_URL is niet geconfigureerd" }, { status: 503 });
  }

  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
  if (action === "aanmelding") {
    const originalRealworksJson = "originalRealworksJson" in payload
      ? (payload as { originalRealworksJson?: unknown }).originalRealworksJson
      : null;
    if (typeof originalRealworksJson !== "string" || !originalRealworksJson.trim()) {
      return NextResponse.json({ error: "Plak eerst de Realworks JSON uit de e-mail" }, { status: 400 });
    }
  }

  try {
    const res = await postToN8n(url, {
      source: "devree-platform",
      action,
      requestedAt: new Date().toISOString(),
      project,
      payload,
    });

    const text = await res.text();
    let result: unknown = null;
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        result = { response: text.slice(0, 500) };
      }
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n workflow gaf HTTP ${res.status}`, workflowStatus: res.status, result },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      action,
      workflowStatus: res.status,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.name === "AbortError" ? "n8n workflow timeout" : "Kan n8n niet bereiken" },
      { status: 502 },
    );
  }
}
