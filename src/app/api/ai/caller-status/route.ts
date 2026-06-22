import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  }

  const startWebhookConfigured = Boolean(process.env.AI_CALL_START_WEBHOOK_URL);
  const infoEmailWebhookConfigured = Boolean(process.env.AI_INFO_EMAIL_WEBHOOK_URL);

  return NextResponse.json({
    callerConfigured: startWebhookConfigured,
    startWebhookConfigured,
    infoEmailWebhookConfigured,
    resultEndpoint: "/api/ai/call-results",
    humanApprovalRequired: true,
    canPlaceCalls: startWebhookConfigured,
    status: startWebhookConfigured ? "ready" : "missing_start_webhook",
  });
}
