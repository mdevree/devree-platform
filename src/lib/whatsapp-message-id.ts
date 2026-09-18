/** WAHA serializes the same key differently in send responses and webhooks. */
export function normalizeWhatsAppMessageId(id: string): string {
  return id.replace(/^(?:true|false)_[^_]+@(?:lid|c\.us|s\.whatsapp\.net|g\.us)_/, "");
}
