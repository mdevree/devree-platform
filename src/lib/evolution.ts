// Evolution API client voor WhatsApp.
// Stuurt uitgaande berichten via de geconfigureerde Evolution-instance.

export class EvolutionError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "EvolutionError";
  }
}

const SEND_TIMEOUT_MS = 15000;

/**
 * Verstuur een WhatsApp-bericht via Evolution.
 * Gooit een EvolutionError met een leesbare melding bij ontbrekende config,
 * time-out of een niet-OK respons, zodat de aanroeper de fout netjes kan tonen.
 */
export async function sendWhatsAppMessage(
  waPhone: string,
  message: string
): Promise<void> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;

  const missing = [
    !apiUrl && "EVOLUTION_API_URL",
    !instance && "EVOLUTION_INSTANCE",
    !apiKey && "EVOLUTION_API_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new EvolutionError(
      `WhatsApp-configuratie ontbreekt: ${missing.join(", ")}`
    );
  }

  const number = waPhone.replace("@s.whatsapp.net", "");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        apikey: apiKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number, text: message }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new EvolutionError("WhatsApp-verzending duurde te lang (time-out)");
    }
    throw new EvolutionError(
      "Kon Evolution API niet bereiken",
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EvolutionError(
      `Evolution API fout: ${res.status} ${res.statusText}`,
      detail
    );
  }
}
