export function parsePdokPoint(value: unknown): { latitude: number; longitude: number } | null {
  const match = String(value || "").match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  const longitude = Number(match[1]), latitude = Number(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export async function geocodeAddress(query: string) {
  const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free");
  url.searchParams.set("q", query); url.searchParams.set("fq", "type:adres"); url.searchParams.set("rows", "1");
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const data = await response.json() as { response?: { docs?: { centroide_ll?: string }[] } };
  return parsePdokPoint(data.response?.docs?.[0]?.centroide_ll);
}
