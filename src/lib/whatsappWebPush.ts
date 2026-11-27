import { createHash } from "node:crypto";
import { sendNotification } from "web-push";
import { getWebPushEndpoint, type webPushConfig } from "@/lib/whatsappWebPushConfig";

type VapidConfig = NonNullable<ReturnType<typeof webPushConfig>>;
type Subscription = { endpoint: string; p256dh: string; authKey: string };
type Notification = { draft: string | null; body: string };
export type WhatsAppPushResult = { status: number; invalid: boolean };

function whatsappPushPreview(body: string) {
  const compact = body.trim().replace(/\s+/g, " ");
  const characters = Array.from(compact);
  return characters.length > 145 ? characters.slice(0, 144).join("") + "…" : compact;
}

export async function sendWhatsAppWebPush(
  config: VapidConfig,
  device: Subscription,
  message: Notification,
  send = sendNotification,
): Promise<WhatsAppPushResult> {
  const endpoint = getWebPushEndpoint(device.endpoint);
  if (!endpoint) return { status: 410, invalid: true };

  const payload = JSON.stringify({
    draft: message.draft,
    body: whatsappPushPreview(message.body) || "Er staat een concept voor je klaar.",
  });
  // RFC 8030 topics are restricted to 32 URL-safe characters.
  const topic = createHash("sha256").update(message.draft ?? "whatsapp-push-test").digest("base64url").slice(0, 32);
  try {
    const result = await send(
      { endpoint, keys: { p256dh: device.p256dh, auth: device.authKey } },
      payload,
      { vapidDetails: config, contentEncoding: "aes128gcm", TTL: 300, timeout: 8_000, topic },
    );
    return { status: result.statusCode, invalid: false };
  } catch (error: unknown) {
    // Provider errors can contain the private endpoint, headers or response body.
    const status = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 0;
    return { status, invalid: status === 404 || status === 410 };
  }
}
