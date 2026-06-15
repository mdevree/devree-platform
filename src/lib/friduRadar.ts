export type FriduRadarContext = {
  available: boolean;
  headline: string;
  text: string;
  riskLevel: "laag" | "gemiddeld" | "hoog";
  badges: string[];
  fullReportUrl: string | null;
  signals: {
    title: string;
    category: string;
    distanceMeters: number | null;
    sourceName: string | null;
    sourceUrl: string | null;
  }[];
  source: "Fridu Radar";
};

type RadarInput = {
  postcode: string;
  huisnummer: number;
  huisletter?: string | null;
  huisnummer_toevoeging?: string | null;
};

function houseNumber(input: RadarInput): string {
  return [
    String(input.huisnummer),
    input.huisletter ? String(input.huisletter).trim() : "",
    input.huisnummer_toevoeging ? String(input.huisnummer_toevoeging).trim() : "",
  ]
    .filter(Boolean)
    .join("");
}

function normalizeRisk(value: unknown): "laag" | "gemiddeld" | "hoog" {
  return value === "hoog" || value === "gemiddeld" || value === "laag" ? value : "laag";
}

export async function fetchFriduRadarContext(input: RadarInput): Promise<FriduRadarContext | null> {
  const baseUrl = process.env.FRIDU_RADAR_API_URL || "https://radar.fridu.nl/api/v1/radar.php";
  const apiKey = process.env.FRIDU_RADAR_API_KEY;
  const timeoutMs = Number.parseInt(process.env.FRIDU_RADAR_TIMEOUT_MS || "4500", 10);

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        postcode: input.postcode.replace(/\s/g, "").toUpperCase(),
        houseNumber: houseNumber(input),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn("Fridu Radar ophalen mislukt:", response.status);
      return null;
    }

    const data = await response.json();
    const compact = data && typeof data === "object" ? data.compactSummary : null;
    const events = Array.isArray(data?.events) ? data.events : [];
    const headline = typeof compact?.headline === "string" ? compact.headline : "";
    const text = typeof compact?.text === "string" ? compact.text : "";
    const badges = Array.isArray(compact?.badges)
      ? compact.badges.filter((badge: unknown): badge is string => typeof badge === "string").slice(0, 3)
      : [];
    const signals = events
      .slice(0, 3)
      .map((event: Record<string, unknown>) => {
        const source = event.source && typeof event.source === "object" ? event.source as Record<string, unknown> : {};
        return {
          title: typeof event.title === "string" ? event.title : "Openbaar signaal",
          category: typeof event.category === "string" ? event.category : "signaal",
          distanceMeters: typeof event.distanceMeters === "number" ? event.distanceMeters : null,
          sourceName: typeof source.name === "string" ? source.name : null,
          sourceUrl: typeof source.url === "string" ? source.url : null,
        };
      });

    if (!headline && !text && badges.length === 0 && signals.length === 0) {
      return null;
    }

    return {
      available: true,
      headline: headline || "Omgevingssignalen beschikbaar",
      text,
      riskLevel: normalizeRisk(compact?.riskLevel),
      badges,
      fullReportUrl: typeof compact?.fullReportUrl === "string" ? compact.fullReportUrl : null,
      signals,
      source: "Fridu Radar",
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name !== "AbortError") {
      console.warn("Fridu Radar ophalen mislukt:", error.message);
    }
    return null;
  }
}
