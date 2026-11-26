export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.LISTING_SEARCH_WORKER === "1"
  ) {
    const { startListingSearchWorker } =
      await import("./lib/listingSearchWorker");
    startListingSearchWorker();
  }
}
