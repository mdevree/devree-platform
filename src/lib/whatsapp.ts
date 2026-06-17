export class WhatsAppError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "WhatsAppError";
  }
}

const SEND_TIMEOUT_MS = 15000;

type WhatsAppProvider = "evolution" | "waha";

function getProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === "waha" ? "waha" : "evolution";
}

function toEvolutionNumber(waPhone: string): string {
  return waPhone.replace("@s.whatsapp.net", "").replace("@c.us", "");
}

function toWahaChatId(waPhone: string): string {
  const number = waPhone.replace("@s.whatsapp.net", "").replace("@c.us", "");
  return `${number}@c.us`;
}

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function sendViaEvolution(
  waPhone: string,
  message: string
): Promise<string | null> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;

  const missing = [
    !apiUrl && "EVOLUTION_API_URL",
    !instance && "EVOLUTION_INSTANCE",
    !apiKey && "EVOLUTION_API_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new WhatsAppError(
      `WhatsApp-configuratie ontbreekt: ${missing.join(", ")}`
    );
  }

  const timeout = withTimeout();
  let res: Response;
  try {
    res = await fetch(
      `${apiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance!)}`,
      {
        method: "POST",
        headers: {
          apikey: apiKey!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ number: toEvolutionNumber(waPhone), text: message }),
        signal: timeout.signal,
      }
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new WhatsAppError("WhatsApp-verzending duurde te lang (time-out)");
    }
    throw new WhatsAppError(
      "Kon Evolution API niet bereiken",
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    timeout.clear();
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new WhatsAppError(
      `Evolution API fout: ${res.status} ${res.statusText}`,
      detail
    );
  }

  const data = await res.json().catch(() => null);
  return data?.key?.id ?? data?.message?.key?.id ?? data?.id ?? null;
}

async function sendViaWaha(
  waPhone: string,
  message: string
): Promise<string | null> {
  const apiUrl = process.env.WAHA_API_URL;
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";

  const missing = [
    !apiUrl && "WAHA_API_URL",
    !apiKey && "WAHA_API_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new WhatsAppError(
      `WhatsApp-configuratie ontbreekt: ${missing.join(", ")}`
    );
  }

  const timeout = withTimeout();
  let res: Response;
  try {
    res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId: toWahaChatId(waPhone),
        text: message,
        session,
      }),
      signal: timeout.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new WhatsAppError("WhatsApp-verzending duurde te lang (time-out)");
    }
    throw new WhatsAppError(
      "Kon WAHA API niet bereiken",
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    timeout.clear();
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new WhatsAppError(
      `WAHA API fout: ${res.status} ${res.statusText}`,
      detail
    );
  }

  const data = await res.json().catch(() => null);
  return data?.key?.id ?? data?.id ?? null;
}

export async function sendWhatsAppMessage(
  waPhone: string,
  message: string
): Promise<string | null> {
  return getProvider() === "waha"
    ? sendViaWaha(waPhone, message)
    : sendViaEvolution(waPhone, message);
}
