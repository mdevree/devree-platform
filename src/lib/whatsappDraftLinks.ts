export const DRAFTS_PATH = "/mobile/whatsapp-concepten";

export function isWhatsAppDraftId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^(reply|followup)-[A-Za-z0-9_-]{1,120}$/.test(id);
}

export function whatsappDraftPath(id?: string) {
  const path = DRAFTS_PATH;
  return isWhatsAppDraftId(id) ? `${path}?draft=${encodeURIComponent(id)}` : path;
}

export function whatsappDraftLoginPath(id?: string) {
  const path = "/login?whatsappConcepten=1";
  return isWhatsAppDraftId(id) ? `${path}&whatsappConcept=${encodeURIComponent(id)}` : path;
}
