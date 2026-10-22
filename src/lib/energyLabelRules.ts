export const DAY = 86_400_000;

export function labelAddressKey(postcode: string, number: string, letter = "", addition = "") {
  const pc = postcode.replace(/\s/g, "").toUpperCase();
  const suffix = (letter + addition).replace(/[\s/-]/g, "").toUpperCase();
  return `${pc}:${number.replace(/^0+(?=\d)/, "")}:${suffix}`;
}

export function mutationAddressKey(postcode: string | null, houseNumber: string | null) {
  if (!postcode || !houseNumber) return null;
  const match = houseNumber.trim().match(/^(\d+)\s*(.*)$/);
  return match ? labelAddressKey(postcode, match[1], "", match[2]) : null;
}

export function listingKind(text: string): "sale" | "rent" | "unknown" {
  if (/\b(huurprijs|per maand|per jaar|p\.?\s*m\.?|te huur|verhuur)\b/i.test(text)) return "rent";
  if (/\b(kosten koper|vrij op naam|koopprijs|te koop)\b|\bk\.?\s*k\.(?:\s|$)|\bv\.?\s*o\.?\s*n\./i.test(text)) return "sale";
  return "unknown";
}

export type MeasurableSignal = {
  detectedAt: Date; baseline: boolean; knownAtDiscovery: boolean;
  areaStatus: string; buildingStatus: string | null;
  firstListedAt: Date | null; listingKind: string | null;
};

export function conversionMetrics(signals: MeasurableSignal[], now = new Date()) {
  const eligible = signals.filter(s => !s.baseline && !s.knownAtDiscovery && s.areaStatus === "matched" && s.buildingStatus === "Bestaand");
  return [30, 60, 90].map(days => {
    const mature = eligible.filter(s => now.getTime() - s.detectedAt.getTime() >= days * DAY);
    const successes = mature.filter(s => s.listingKind === "sale" && s.firstListedAt && s.firstListedAt > s.detectedAt && s.firstListedAt.getTime() - s.detectedAt.getTime() <= days * DAY);
    const leads = successes.map(s => (s.firstListedAt!.getTime() - s.detectedAt.getTime()) / DAY).sort((a,b) => a-b);
    const middle = Math.floor(leads.length / 2);
    return { days, eligible: mature.length, confirmed: successes.length,
      percent: mature.length ? Math.round(successes.length / mature.length * 1000) / 10 : null,
      medianLeadDays: leads.length ? Math.round((leads.length % 2 ? leads[middle] : (leads[middle-1]+leads[middle])/2)*10)/10 : null };
  });
}
