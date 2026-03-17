"use client";

import { LightBulbIcon } from "@heroicons/react/24/outline";
import type { WoningRecord } from "../actions";

interface Props {
  records: WoningRecord[];
  gefilterd: WoningRecord[];
  budget: number;
  soort: string;
  stad: string;
}

export default function ConcessiesBlok({
  records,
  gefilterd,
  budget,
  soort,
  stad,
}: Props) {
  const tips: string[] = [];

  // 1. Niets beschikbaar? Bereken minimale budget-verhoging
  if (gefilterd.length === 0) {
    const actief = records.filter((r) =>
      ["Beschikbaar", "Onder bod"].includes(r.status)
    );
    let suggestBudget = budget;
    while (suggestBudget < 1000000) {
      suggestBudget += 25000;
      const matches = actief.filter((r) => r.prijs <= suggestBudget);
      if (matches.length > 0) {
        tips.push(
          `Met een budget van €${suggestBudget.toLocaleString("nl-NL")} zijn er ${matches.length} actieve woning(en) beschikbaar.`
        );
        break;
      }
    }
  }

  // 2. Woonhuis gefilterd maar appartementen beschikbaar?
  if (soort === "Woonhuis") {
    const appCount = records.filter(
      (r) => r.soort_og === "Appartement" && r.prijs <= budget
    ).length;
    if (appCount > 0) {
      tips.push(
        `Er zijn ${appCount} appartement(en) binnen budget. Overweeg ook appartementen mee te nemen.`
      );
    }
  }

  // 3. Alleen één stad? Toon wat de andere stad biedt
  if (stad !== "all") {
    const anderePlaatsen = records.filter(
      (r) => r.plaats !== stad && r.prijs <= budget
    );
    const uniekePlaatsen = [...new Set(anderePlaatsen.map((r) => r.plaats))];
    if (uniekePlaatsen.length > 0) {
      tips.push(
        `In ${uniekePlaatsen.join(", ")} zijn nog ${anderePlaatsen.length} woning(en) binnen budget beschikbaar.`
      );
    }
  }

  // 4. Label D/E/F beschikbaar? Verduurzamingstip
  const slechteLabels = gefilterd.filter((r) =>
    ["D", "E", "F", "G"].includes(r.label.replace(/[^A-G]/g, ""))
  );
  if (slechteLabels.length > 0) {
    tips.push(
      `${slechteLabels.length} woning(en) hebben label D-G. Met de NHG-duurzaamheidslening kun je tot €20.000 extra lenen voor verduurzaming.`
    );
  }

  // 5. Snelheid-tip
  const recentVerkocht = records.filter(
    (r) =>
      r.status === "Verkocht" || r.status === "Verkocht onder voorbehoud"
  ).length;
  if (recentVerkocht > 0) {
    const pctVerkocht = Math.round((recentVerkocht / records.length) * 100);
    tips.push(
      `${pctVerkocht}% van de woningen in dit overzicht is al verkocht — de markt beweegt snel.`
    );
  }

  if (tips.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
        <LightBulbIcon className="h-5 w-5" />
        Inzichten &amp; suggesties
      </h3>
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-2 text-sm text-amber-800">
            <span className="mt-0.5 flex-shrink-0 text-amber-500">&bull;</span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}
