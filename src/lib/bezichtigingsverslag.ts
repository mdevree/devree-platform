export const verkoopstatussen = {
  gepland: "Gepland", gehad: "Gehad", followup_verstuurd: "Opvolging verstuurd", offerte_geaccepteerd: "Offerte geaccepteerd",
};
export const leegVerslag = { notities: "", interesse: "", verkoopstatus: "", vervolgactie: "" };
export type Invoer = typeof leegVerslag;
export type Verslag = {
  invoer: Invoer;
  versie: number;
  status: "concept" | "verwerken" | "verwerkt";
  contactId?: number;
  tijdstip: string;
  poging?: number;
  notitieId?: number;
};
export function geldigeInvoer(value: unknown): value is Invoer {
  if (!value || typeof value !== "object") return false;
  const v = value as Invoer;
  return Object.keys(value).every(k => Object.hasOwn(leegVerslag,k))
    && Object.keys(leegVerslag).every(k => typeof v[k as keyof Invoer] === "string")
    && v.notities.length <= 8000 && v.vervolgactie.length <= 2000
    && (v.interesse === "" || /^(100|[1-9]?\d)$/.test(v.interesse))
    && (v.verkoopstatus === "" || Object.hasOwn(verkoopstatussen, v.verkoopstatus))
    && [v.notities, v.vervolgactie, v.interesse, v.verkoopstatus].some(s => s.trim());
}
