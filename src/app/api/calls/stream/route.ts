import { callEmitter, type CallEvent } from "@/lib/callStream";

/**
 * GET /api/calls/stream
 * Server-Sent Events (SSE) endpoint voor live call meldingen
 * Clients verbinden hiermee en ontvangen real-time call events
 */
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Stuur initieel connected bericht
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      // Luister naar call events
      const unsubscribe = callEmitter.subscribe((event: CallEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Client is disconnected
          unsubscribe();
        }
      });

      // Heartbeat elke 30 seconden om de verbinding open te houden
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 30000);

      // Cleanup bij afsluiten
      // Note: ReadableStream cancel wordt aangeroepen als client disconnect
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
