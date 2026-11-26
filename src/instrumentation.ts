export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.LISTING_SEARCH_WORKER === "1") {
    const { startListingSearchWorker } =
      await import("./lib/listingSearchWorker");
    startListingSearchWorker();
  }
  if (process.env.WHATSAPP_REPLY_OFFICE_ENABLED === "1" || process.env.WHATSAPP_REPLY_PERSONAL_ENABLED === "1") {
    const { startWhatsAppReplyWorker } = await import("./lib/whatsappReplyWorker");
    startWhatsAppReplyWorker();
  }
  if (process.env.WHATSAPP_DRAFT_PUSH_WORKER === "1") {
    const { startWhatsAppDraftPushWorker } = await import("./lib/whatsappDraftPush");
    startWhatsAppDraftPushWorker();
  }
}
