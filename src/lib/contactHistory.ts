export type HistoryCategory = "appointments" | "whatsapp" | "calls" | "activity";
export type HistoryItem = { id: string; at: string; category: HistoryCategory; title: string; detail?: string; source: string; appointmentId?: string };
export const appointmentEventLabels: Record<string, string> = {
  page_open: "Afspraakpagina geopend", video_start: "Video gestart", video_progress_25: "Video: 25% bereikt", video_progress_75: "Video: 75% bereikt", video_complete: "Video tot einde afgespeeld", woning_click: "Woninglink aangeklikt", whatsapp_click: "WhatsApp-knop aangeklikt", review_click: "Google-reviewlink aangeklikt", route_click: "Route aangeklikt", calendar_click: "Agenda-link aangeklikt", confirm_click: "Afspraak bevestigd", cancel_click: "Annulering aangevraagd",
};
export function historyPage(items: HistoryItem[], cursor: string | null, category: string | null) {
  let boundary: { at: string; id: string } | null = null;
  if (cursor) {
    boundary = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (!boundary || typeof boundary.id !== "string" || typeof boundary.at !== "string" || !Number.isFinite(Date.parse(boundary.at))) throw new Error("Ongeldige cursor");
  }
  const sorted = items.filter(item => (!category || item.category === category) && (!boundary || item.at < boundary.at || (item.at === boundary.at && item.id < boundary.id)))
    .sort((a, b) => a.at === b.at ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.at < b.at ? 1 : -1);
  const page = sorted.slice(0, 50);
  const last = page.at(-1);
  return { items: page, nextCursor: sorted.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.at, id: last.id })).toString("base64url") : null };
}
export function mirroredAppointmentEvent(event: { eventType: string; clickedUrl: string | null; occurredAt: Date; rawPayload?: unknown }, originals: { eventType: string; createdAt: Date; path: string | null; sessionId?: string | null }[]) {
  if (!event.eventType.startsWith("appointment.")) return false;
  const payload = event.rawPayload && typeof event.rawPayload === "object" ? event.rawPayload as Record<string, unknown> : {};
  return originals.some(original => {
    const delta = Math.abs(original.createdAt.getTime() - event.occurredAt.getTime());
    // Existing mirrored inserts differ by a few milliseconds. Require the same
    // session as well as type/path for those historical copies.
    const sameMoment = delta === 0 || (delta < 2000 && Boolean(original.sessionId) && original.sessionId === payload.sessionId);
    return event.eventType === `appointment.${original.eventType}` && sameMoment && original.path === event.clickedUrl;
  });
}
