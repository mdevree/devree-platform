type GatewayResponse = Record<string, unknown>;

async function callGateway(payload: Record<string, unknown>): Promise<GatewayResponse> {
  const url = process.env.RAG_GATEWAY_URL;
  const secret = process.env.RAG_GATEWAY_SECRET || process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("AI-gateway is niet geconfigureerd");

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`AI-gateway gaf HTTP ${response.status}`);
  return response.json() as Promise<GatewayResponse>;
}

export async function embedTexts(input: string[]): Promise<number[][]> {
  if (!input.length) return [];
  const data = await callGateway({ operation: "embed", model: "text-embedding-3-small", dimensions: 1024, input });
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.map((row) => (row as { embedding?: number[] }).embedding || []);
}

export async function generateAnswer(system: string, user: string): Promise<string> {
  const data = await callGateway({
    operation: "generate",
    model: process.env.RAG_CHAT_MODEL || "gpt-5-mini",
    store: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
  });
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  throw new Error("AI-gateway gaf geen antwoordtekst");
}
