import type { MauticContactPipeline } from "./mautic";

/**
 * Kansen-classificatie.
 *
 * Belangrijk: de scoring zelf blijft in Mautic (punten + warmScore). Hier doen we
 * géén parallelle score-engine, maar bucketten we Mautic-contacten op het kans-TYPE
 * volgens dezelfde veldcriteria die ook de Mautic-segmenten gebruiken, en sorteren
 * we binnen elke bucket op Mautic's eigen punten/warmScore. Zodra de Mautic-segmenten
 * (Fase 1A) live zijn, kan dit één-op-één tegen segment-lidmaatschap aangelegd worden.
 */

export type KansType = "hete_koper" | "opdrachtkans" | "herwarmen";

export interface KansItem {
  contactId: number;
  naam: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  type: KansType;
  warmScore: number;
  points: number;
  bezichtigingInteresse: number | null;
  // Korte, leesbare onderbouwing waarom dit een kans is.
  redenen: string[];
}

export interface KansGroep {
  type: KansType;
  label: string;
  beschrijving: string;
  items: KansItem[];
}

const DAG_MS = 1000 * 60 * 60 * 24;

// Herwarmen: contacten uit het 'last-contact' segment (≤6 mnd contact, mét
// e-mailadres) die 3+ maanden stil zijn geworden.
const HERWARM_MIN_DAGEN = 90; // 3 maanden stil
const HERWARM_MAX_DAGEN = 180; // binnen 6 maanden contact gehad

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / DAG_MS;
}

function naamVan(c: MauticContactPipeline): string {
  const n = `${c.firstname ?? ""} ${c.lastname ?? ""}`.trim();
  return n || c.email || c.phone || `Contact ${c.id}`;
}

/**
 * Bepaal het kans-type van een contact, of null als het (nu) geen kans is.
 * Volgorde van prioriteit: hete koper > opdrachtkans > herwarmen.
 */
export function classifyKans(c: MauticContactPipeline): KansItem | null {
  const redenen: string[] = [];
  const dagen = daysSince(c.lastActive);

  // Hete koper: hoge bezichtigingsinteresse en/of recente warmte.
  const hogeInteresse =
    c.bezichtigingInteresse !== null && c.bezichtigingInteresse >= 60;
  const heet = c.warmScore >= 30 && c.points >= 5;
  if (hogeInteresse || (heet && dagen !== null && dagen < 14)) {
    if (hogeInteresse)
      redenen.push(`Bezichtigingsinteresse ${c.bezichtigingInteresse}/100`);
    if (heet) redenen.push(`Warm (score ${c.warmScore})`);
    if (dagen !== null && dagen < 14)
      redenen.push(`Recent actief (${Math.round(dagen)} dgn geleden)`);
    return {
      ...baseItem(c),
      type: "hete_koper",
      redenen,
    };
  }

  // Opdrachtkans: eigen woning + overweegt verkoop (lead → verkoopopdracht).
  if (c.kijkerEigenWoning && c.kijkerOverwegtVerkoop) {
    redenen.push("Heeft eigen woning", "Overweegt verkoop");
    if (c.warmScore > 0) redenen.push(`Score ${c.warmScore}`);
    return {
      ...baseItem(c),
      type: "opdrachtkans",
      redenen,
    };
  }

  // Herwarmen: had contact binnen 6 mnd (mét e-mail) maar is 3+ mnd stil.
  if (
    c.email &&
    dagen !== null &&
    dagen >= HERWARM_MIN_DAGEN &&
    dagen <= HERWARM_MAX_DAGEN
  ) {
    redenen.push(`Al ${Math.round(dagen)} dgn stil`, "Binnen 6-mnd e-mailsegment");
    if (c.points > 0) redenen.push(`${c.points} punten opgebouwd`);
    return {
      ...baseItem(c),
      type: "herwarmen",
      redenen,
    };
  }

  return null;
}

function baseItem(c: MauticContactPipeline): Omit<KansItem, "type" | "redenen"> {
  return {
    contactId: c.id,
    naam: naamVan(c),
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    warmScore: c.warmScore,
    points: c.points,
    bezichtigingInteresse: c.bezichtigingInteresse,
  };
}

const GROEP_META: Record<KansType, { label: string; beschrijving: string }> = {
  hete_koper: {
    label: "Hete kopers",
    beschrijving: "Hoge interesse of recent warm — nu bellen/appen.",
  },
  opdrachtkans: {
    label: "Opdrachtkansen",
    beschrijving: "Eigen woning + overweegt verkoop — verkoopgesprek aanbieden.",
  },
  herwarmen: {
    label: "Herwarmen",
    beschrijving: "Opgebouwde punten maar stil geworden — opnieuw activeren.",
  },
};

const GROEP_VOLGORDE: KansType[] = ["hete_koper", "opdrachtkans", "herwarmen"];

/**
 * Groepeer een lijst pipeline-contacten in kans-groepen, gesorteerd op warmScore.
 */
export function groupKansen(contacts: MauticContactPipeline[]): KansGroep[] {
  const buckets: Record<KansType, KansItem[]> = {
    hete_koper: [],
    opdrachtkans: [],
    herwarmen: [],
  };

  for (const c of contacts) {
    const item = classifyKans(c);
    if (item) buckets[item.type].push(item);
  }

  return GROEP_VOLGORDE.map((type) => ({
    type,
    label: GROEP_META[type].label,
    beschrijving: GROEP_META[type].beschrijving,
    items: buckets[type].sort((a, b) => b.warmScore - a.warmScore),
  }));
}
