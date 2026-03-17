"use server";

import * as XLSX from "xlsx";

export interface WoningRecord {
  adres: string;
  postcode: string;
  plaats: string;
  prijs: number;
  prijs_m2: number | null;
  trans_prijs: number | null;
  datum_aanmelding: string;
  voorbehoud: string | null;
  datum_afmelding: string | null;
  m2: number | null;
  perceel: number | null;
  bouwjaar: string;
  kamers: number | null;
  slaapkamers: number | null;
  soort_og: "Woonhuis" | "Appartement" | string;
  soort: string;
  type: string;
  label: string;
  status:
    | "Beschikbaar"
    | "Onder bod"
    | "Verkocht onder voorbehoud"
    | "Verkocht"
    | string;
}

function formatXLSDate(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toLocaleDateString("nl-NL");
  }
  return "";
}

export async function parseXLS(formData: FormData): Promise<WoningRecord[]> {
  const file = formData.get("file") as File;
  if (!file) throw new Error("Geen bestand gevonden");

  const buffer = Buffer.from(await file.arrayBuffer());

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
  });

  // Rij 11 = headers, data vanaf rij 12
  const dataRows = rows.slice(12) as (string | number | null)[][];

  return dataRows
    .filter((row) => row[8] && Number(row[8]) > 0)
    .map((row) => ({
      adres: `${row[0] || ""} ${row[1] ? Math.round(Number(row[1])) : ""}`.trim(),
      postcode: String(row[3] || ""),
      plaats: String(row[4] || ""),
      prijs: Number(row[8]),
      prijs_m2: row[10] ? Number(row[10]) : null,
      trans_prijs: row[11] ? Number(row[11]) : null,
      datum_aanmelding: formatXLSDate(row[16]),
      voorbehoud: formatXLSDate(row[17]) || null,
      datum_afmelding: formatXLSDate(row[19]) || null,
      m2: row[26] ? Number(row[26]) : null,
      perceel: row[28] ? Number(row[28]) : null,
      bouwjaar: String(row[33] || ""),
      kamers: row[34] ? Number(row[34]) : null,
      slaapkamers: row[35] ? Number(row[35]) : null,
      soort_og: String(row[36] || ""),
      soort: String(row[37] || row[38] || ""),
      type: String(row[39] || ""),
      label: String(row[42] || ""),
      status: String(row[45] || ""),
    }));
}
