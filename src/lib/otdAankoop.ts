import type { OtdCompletenessIssue, OtdOpdrachtgever } from "./otd";

// Platformdefaults voor de aankoopopdracht (bedragen incl. BTW).
// Een project-veld van null of 0 valt terug op deze defaults, zodat het
// juridische document nooit lege bedragen bevat.
export const DEFAULT_AANKOOP_TARIEVEN = {
  vastTarief: 3000,
  toeslagExtraWoning: 100,
  maxWoningen: 5,
  intrekking: 750,
  bedenktijd: 500,
  nietDoorzetten: 500,
};

export const AANKOOP_WERKGEBIED_DEFAULT =
  "circa 30 minuten reistijd vanaf het kantoor te Spijkenisse - hieronder vallen in ieder geval "
  + "de gemeenten Nissewaard en Voorne aan Zee, alsmede de stadsdelen Rozenburg, Pernis en Hoogvliet";

export const AANKOOP_WERKZAAMHEDEN = [
  "Zoeken in het woningaanbod",
  "Bezichtigingen",
  "Onderzoek en woninganalyse",
  "Beoordelen van de waarde",
  "Vaststellen biedingsstrategie",
  "Onderhandelingen",
  "Controle koopovereenkomst",
  "Afwikkeling van de aankoop",
];

export type AankoopTarieven = {
  vastTarief: number;
  toeslagExtraWoning: number;
  maxWoningen: number;
  intrekking: number;
  bedenktijd: number;
  nietDoorzetten: number;
  werkgebied: string;
};

export type AankoopTariefProjectVelden = {
  aankoopTariefVast: number | null;
  aankoopToeslagExtraWoning: number | null;
  aankoopMaxWoningen: number | null;
  aankoopKostenNietDoorzetten: number | null;
  kostenIntrekking: number | null;
  kostenBedenktijd: number | null;
  aankoopWerkgebied: string | null;
};

function bedragOfDefault(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function aankoopTarievenFromProject(project: AankoopTariefProjectVelden): AankoopTarieven {
  return {
    vastTarief: bedragOfDefault(project.aankoopTariefVast, DEFAULT_AANKOOP_TARIEVEN.vastTarief),
    toeslagExtraWoning: bedragOfDefault(project.aankoopToeslagExtraWoning, DEFAULT_AANKOOP_TARIEVEN.toeslagExtraWoning),
    maxWoningen: bedragOfDefault(project.aankoopMaxWoningen, DEFAULT_AANKOOP_TARIEVEN.maxWoningen),
    intrekking: bedragOfDefault(project.kostenIntrekking, DEFAULT_AANKOOP_TARIEVEN.intrekking),
    bedenktijd: bedragOfDefault(project.kostenBedenktijd, DEFAULT_AANKOOP_TARIEVEN.bedenktijd),
    nietDoorzetten: bedragOfDefault(project.aankoopKostenNietDoorzetten, DEFAULT_AANKOOP_TARIEVEN.nietDoorzetten),
    werkgebied: project.aankoopWerkgebied?.trim() || AANKOOP_WERKGEBIED_DEFAULT,
  };
}

// Anders dan bij verkoop identificeert de aankoop-OTD geen specifiek object;
// vraagprijs, courtage, adres en kadaster zijn hier bewust geen vereisten.
export function otdAankoopCompletenessIssues(opdrachtgevers: OtdOpdrachtgever[]): OtdCompletenessIssue[] {
  const issues: OtdCompletenessIssue[] = [];

  if (!opdrachtgevers.length) {
    issues.push({ field: "opdrachtgevers", label: "Opdrachtgever(s) ontbreken", severity: "required" });
  }

  opdrachtgevers.forEach((opdrachtgever, index) => {
    const prefix = `opdrachtgevers.${index}`;
    if (!opdrachtgever.voornamen) issues.push({ field: `${prefix}.voornamen`, label: `Voornamen ontbreken bij opdrachtgever ${index + 1}`, severity: "warning" });
    if (!opdrachtgever.email) issues.push({ field: `${prefix}.email`, label: `E-mailadres ontbreekt bij opdrachtgever ${index + 1}`, severity: "warning" });
  });

  return issues;
}
