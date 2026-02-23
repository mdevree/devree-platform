"use client";

import { useState } from "react";
import {
  PrinterIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BuurtdataResult {
  meta: {
    gegenereerd_op: string;
    bronnen: string[];
  };
  adres: {
    straat: string;
    huisnummer: number;
    huisletter: string | null;
    huisnummer_toevoeging: string | null;
    postcode: string;
    woonplaats: string;
    volledig: string;
  };
  verblijfsobject: {
    id: string;
    nummeraanduiding_id: string;
    type: string;
    status: string;
    oppervlakte_m2: number | null;
    bouwjaar: string | null;
    gebruiksdoelen: string[];
  };
  pand: {
    pand_id: string | null;
    pand_status: string | null;
    pand_bouwjaar: string | null;
  };
  coordinaten: {
    rd_x: number;
    rd_y: number;
    lat: number;
    lon: number;
  } | null;
  locatie: {
    buurt_naam: string;
    wijk_naam: string;
    gemeente_naam: string;
  };
  energielabel: {
    klasse: string;
    registratiedatum: string | null;
    geldig_tot: string | null;
    gebouwtype: string | null;
    gebouwsubtype: string | null;
    bouwjaar_ep: number | null;
    bag_verblijfsobject_id: string | null;
  } | null;
  buurtdata: {
    buurt_code: string;
    bevolking: {
      aantal_inwoners: number | null;
      mannen: number | null;
      vrouwen: number | null;
      gem_huishoudensgrootte: number | null;
      bevolkingsdichtheid_km2: number | null;
      stedelijkheidsklasse: number | null;
      omgevingsadressendichtheid: number | null;
      stedelijkheidsklasse_label: string | null;
    };
    leeftijdsopbouw: {
      leeftijd_0_15: number | null;
      leeftijd_15_25: number | null;
      leeftijd_25_45: number | null;
      leeftijd_45_65: number | null;
      leeftijd_65_plus: number | null;
    };
    huishoudens: {
      totaal: number | null;
      eenpersoonshuishoudens: number | null;
      met_kinderen: number | null;
      zonder_kinderen: number | null;
      ongehuwd: number | null;
      gehuwd: number | null;
      gescheiden: number | null;
      verweduwd: number | null;
    };
    demografie: {
      geboorte_totaal: number | null;
      geboorte_per_1000: number | null;
      sterfte_totaal: number | null;
      sterfte_per_1000: number | null;
      herkomst_nederland: number | null;
      herkomst_europa_excl_nl: number | null;
      herkomst_buiten_europa: number | null;
    };
    woningmarkt: {
      woningvoorraad: number | null;
      koopwoningen_pct: number | null;
      huurwoningen_pct: number | null;
      corporatiewoningen_pct: number | null;
      gem_woz_waarde_eur: number | null;
      aardgaswoningen_pct: number | null;
      aardgasvrije_woningen_pct: number | null;
      stadsverwarming_pct: number | null;
      bouwjaar_afgelopen_10jr_pct: number | null;
      bouwjaar_ouder_10jr_pct: number | null;
    };
    inkomen: {
      gem_gestandaardiseerd_inkomen_eur: number | null;
      gem_inkomen_per_inwoner_eur: number | null;
      gem_inkomen_per_ontvanger_eur: number | null;
      mediaan_vermogen_eur: number | null;
      pct_in_armoede: number | null;
    };
    bereikbaarheid: {
      afstand_huisarts_km: number | null;
      afstand_grote_supermarkt_km: number | null;
      afstand_kinderdagverblijf_km: number | null;
      afstand_school_km: number | null;
      scholen_binnen_3km: number | null;
    };
    mobiliteit: {
      personenautos_totaal: number | null;
      personenautos_per_hh: number | null;
      personenautos_benzine: number | null;
      personenautos_overig: number | null;
      motorfietsen: number | null;
    };
    sociaal: {
      bijstand_ontvangers: number | null;
      aow_ontvangers: number | null;
      ww_ontvangers: number | null;
      ao_ontvangers: number | null;
      pct_jeugdzorg: number | null;
      wmo_clienten: number | null;
    };
  } | null;
  leefbaarheid: {
    klasse_score: number;
    klasse_label: string;
    afwijking_tov_nl: number | null;
    gemeente: string;
    buurt_naam: string;
    peiljaar: number;
  } | null;
  klimaat: {
    wateroverlast: { hoogte_cm: number | null; label: string | null };
    hittestress: { hitte_eiland_graad_c: number | null; label: string | null };
    groen: { percentage: number | null };
    bron: string;
  } | null;
  geluid: {
    wegverkeer: { lden_db: number | null; label: string | null; data: string };
    spoorweg: { lden_db: number | null; label: string | null; data: string };
    industrie: { lden_db: number | null; label: string | null; data: string };
    bron: string;
  } | null;
  luchtkwaliteit: {
    no2: { jaargemiddelde_ug_m3: number | null; label: string | null; data: string };
    pm25: { jaargemiddelde_ug_m3: number | null; label: string | null; data: string };
    pm10: { jaargemiddelde_ug_m3: number | null; label: string | null; data: string };
    normen: {
      who_2021: { no2: number; pm25: number; pm10: number };
      eu_2024: { no2: number; pm25: number; pm10: number };
    };
    bron: string;
  } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, suffix?: string): string {
  if (value === null || value === undefined) return "—";
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("nl-NL")
    : value.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function fmtEur(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

function leefbaarheidColors(score: number): { bg: string; text: string; border: string } {
  if (score >= 7) return { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
  if (score >= 5) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
}

function luchtkwaliteitColor(value: number | null, whoNorm: number): string {
  if (value === null) return "text-gray-500";
  if (value <= whoNorm) return "text-green-600";
  if (value <= whoNorm * 1.5) return "text-amber-600";
  return "text-red-600";
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({
  title,
  source,
  children,
}: {
  title: string;
  source?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 break-inside-avoid">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-gray-200 pb-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-600">{title}</h2>
        {source && (
          <span className="text-[10px] italic text-gray-400">Bron: {source}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-[11px] text-gray-500">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-gray-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AirQualityRow({
  label,
  value,
  unit,
  whoNorm,
  euNorm,
  dataLabel,
  qualityLabel,
  nlGemiddeld,
}: {
  label: string;
  value: number | null;
  unit: string;
  whoNorm: number;
  euNorm: number;
  dataLabel: string;
  qualityLabel: string | null;
  nlGemiddeld?: number;
}) {
  const colorClass = luchtkwaliteitColor(value, whoNorm);
  const belowWho = value !== null && value <= whoNorm;

  return (
    <div className="grid grid-cols-12 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
      <div className="col-span-3">
        <p className="text-[11px] text-gray-500">{dataLabel}</p>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
      </div>
      <div className="col-span-3">
        <p className={`text-lg font-bold ${colorClass}`}>
          {fmt(value)} <span className="text-xs font-normal">{unit}</span>
        </p>
        {qualityLabel && <p className="text-[11px] text-gray-500">{qualityLabel}</p>}
        {nlGemiddeld !== undefined && (
          <p className="text-[10px] text-gray-400">NL gem. ~{nlGemiddeld} {unit}</p>
        )}
      </div>
      <div className="col-span-3 text-center">
        <p className="text-[10px] text-gray-400">WHO norm</p>
        <p className={`text-sm font-medium ${belowWho ? "text-green-600" : "text-red-500"}`}>
          {whoNorm} {unit}
        </p>
        {value !== null && (
          <p className={`text-[10px] font-medium ${belowWho ? "text-green-600" : "text-red-500"}`}>
            {belowWho ? "✓ Onder norm" : "✗ Boven norm"}
          </p>
        )}
      </div>
      <div className="col-span-3 text-center">
        <p className="text-[10px] text-gray-400">EU norm</p>
        <p className="text-sm font-medium text-gray-600">{euNorm} {unit}</p>
        {value !== null && (
          <p className={`text-[10px] font-medium ${value <= euNorm ? "text-green-600" : "text-red-500"}`}>
            {value <= euNorm ? "✓ Onder norm" : "✗ Boven norm"}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Report ─────────────────────────────────────────────────────────────────

function BuurtdataReport({ data }: { data: BuurtdataResult }) {
  const bd = data.buurtdata;
  const lf = data.leefbaarheid;
  const klm = data.klimaat;
  const gel = data.geluid;
  const lk = data.luchtkwaliteit;
  const lfColors = lf ? leefbaarheidColors(lf.klasse_score) : null;

  return (
    <div className="mx-auto max-w-4xl">
      {/* ── Rapport Header ── */}
      <div className="mb-8 flex items-start justify-between border-b-4 border-primary pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-gray-400">
            Buurtdata Rapport
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{data.adres.volledig}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>Buurt: <strong className="text-gray-700">{data.locatie.buurt_naam}</strong></span>
            <span>Wijk: <strong className="text-gray-700">{data.locatie.wijk_naam}</strong></span>
            <span>Gemeente: <strong className="text-gray-700">{data.locatie.gemeente_naam}</strong></span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Gegenereerd op {fmtDate(data.meta.gegenereerd_op)}
          </p>
        </div>
        <div className="hidden shrink-0 print:block">
          <Image
            src="https://www.devreemakelaardij.nl/wp-content/uploads/2026/01/LOGO-1.png"
            alt="De Vree Makelaardij"
            width={140}
            height={42}
            className="h-10 w-auto object-contain"
            unoptimized
          />
        </div>
      </div>

      {/* ── Woninggegevens ── */}
      <Section title="Woninggegevens" source="BAG (Kadaster)">
        <StatGrid
          items={[
            { label: "Type", value: data.verblijfsobject.type ?? "—" },
            { label: "Status", value: data.verblijfsobject.status ?? "—" },
            { label: "Oppervlakte", value: fmt(data.verblijfsobject.oppervlakte_m2, "m²") },
            { label: "Bouwjaar", value: data.verblijfsobject.bouwjaar ?? "—" },
            {
              label: "Gebruiksdoelen",
              value: data.verblijfsobject.gebruiksdoelen?.join(", ") || "—",
            },
            {
              label: "Energielabel",
              value: data.energielabel ? data.energielabel.klasse : "Niet geregistreerd",
            },
            ...(data.energielabel?.gebouwtype
              ? [{ label: "Gebouwtype", value: data.energielabel.gebouwtype }]
              : []),
            ...(data.energielabel?.geldig_tot
              ? [
                  {
                    label: "Label geldig tot",
                    value: new Date(data.energielabel.geldig_tot).toLocaleDateString("nl-NL"),
                  },
                ]
              : []),
            ...(data.pand.pand_bouwjaar
              ? [{ label: "Pand bouwjaar", value: data.pand.pand_bouwjaar }]
              : []),
            ...(data.coordinaten
              ? [
                  {
                    label: "Coördinaten",
                    value: `${data.coordinaten.lat.toFixed(5)}, ${data.coordinaten.lon.toFixed(5)}`,
                  },
                ]
              : []),
          ]}
        />
      </Section>

      {/* ── Leefbaarheid ── (prominent) */}
      {lf && lfColors && (
        <Section title="Leefbaarheid" source={`Leefbaarometer ${lf.peiljaar} (ABF Research)`}>
          <div
            className={`flex items-center gap-6 rounded-xl border-2 p-5 ${lfColors.bg} ${lfColors.border}`}
          >
            <div className="text-center">
              <p className={`text-5xl font-extrabold ${lfColors.text}`}>{lf.klasse_score}</p>
              <p className="mt-0.5 text-xs text-gray-500">Score (max 10)</p>
            </div>
            <div className="flex-1">
              <p className={`text-xl font-bold ${lfColors.text}`}>{lf.klasse_label}</p>
              <p className="text-sm text-gray-600">
                Buurt: <strong>{lf.buurt_naam}</strong> · Gemeente: {lf.gemeente}
              </p>
              {lf.afwijking_tov_nl !== null && (
                <p className="mt-1 text-sm text-gray-500">
                  t.o.v. Nederland:{" "}
                  <strong className={lfColors.text}>
                    {lf.afwijking_tov_nl > 0.5
                      ? "Ruim boven gemiddeld"
                      : lf.afwijking_tov_nl < -0.5
                      ? "Onder gemiddeld"
                      : "Iets beter dan gemiddeld"}
                  </strong>
                </p>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ── Demografische gegevens ── */}
      {bd && (
        <>
          <Section title="Bevolking" source="CBS Kerncijfers Wijken en Buurten 2024">
            <StatGrid
              items={[
                { label: "Aantal inwoners", value: fmt(bd.bevolking.aantal_inwoners) },
                { label: "Mannen", value: fmt(bd.bevolking.mannen) },
                { label: "Vrouwen", value: fmt(bd.bevolking.vrouwen) },
                {
                  label: "Gem. huishoudensgrootte",
                  value: fmt(bd.bevolking.gem_huishoudensgrootte),
                },
                {
                  label: "Bevolkingsdichtheid",
                  value: fmt(bd.bevolking.bevolkingsdichtheid_km2, "/ km²"),
                },
                {
                  label: "Stedelijkheid",
                  value: bd.bevolking.stedelijkheidsklasse_label ?? "—",
                },
              ]}
            />

            {/* Leeftijdsopbouw */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Leeftijdsopbouw
              </p>
              <div className="space-y-1.5">
                {[
                  { label: "0–15 jaar", value: bd.leeftijdsopbouw.leeftijd_0_15 },
                  { label: "15–25 jaar", value: bd.leeftijdsopbouw.leeftijd_15_25 },
                  { label: "25–45 jaar", value: bd.leeftijdsopbouw.leeftijd_25_45 },
                  { label: "45–65 jaar", value: bd.leeftijdsopbouw.leeftijd_45_65 },
                  { label: "65+ jaar", value: bd.leeftijdsopbouw.leeftijd_65_plus },
                ].map((item) => {
                  const total = bd.bevolking.aantal_inwoners ?? 1;
                  const widthPct =
                    item.value !== null ? Math.round((item.value / total) * 100) : 0;
                  return (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-[11px] text-gray-500">
                        {item.label}
                      </span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-full rounded bg-primary/60"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs font-medium text-gray-700">
                        {fmt(item.value)} ({widthPct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Herkomst */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Herkomst
              </p>
              <StatGrid
                items={[
                  {
                    label: "Nederland",
                    value: fmt(bd.demografie.herkomst_nederland),
                  },
                  {
                    label: "Europa (excl. NL)",
                    value: fmt(bd.demografie.herkomst_europa_excl_nl),
                  },
                  {
                    label: "Buiten Europa",
                    value: fmt(bd.demografie.herkomst_buiten_europa),
                  },
                ]}
              />
            </div>
          </Section>

          {/* ── Huishoudens ── */}
          <Section title="Huishoudens" source="CBS Kerncijfers Wijken en Buurten 2024">
            <StatGrid
              items={[
                { label: "Totaal huishoudens", value: fmt(bd.huishoudens.totaal) },
                {
                  label: "Eenpersoonshuish.",
                  value: fmt(bd.huishoudens.eenpersoonshuishoudens),
                },
                { label: "Met kinderen", value: fmt(bd.huishoudens.met_kinderen) },
                { label: "Zonder kinderen", value: fmt(bd.huishoudens.zonder_kinderen) },
                { label: "Gehuwd", value: fmt(bd.huishoudens.gehuwd) },
                { label: "Ongehuwd", value: fmt(bd.huishoudens.ongehuwd) },
                { label: "Gescheiden", value: fmt(bd.huishoudens.gescheiden) },
                { label: "Verweduwd", value: fmt(bd.huishoudens.verweduwd) },
              ]}
            />
          </Section>

          {/* ── Woningmarkt ── */}
          <Section title="Woningmarkt" source="CBS Kerncijfers Wijken en Buurten 2024">
            <StatGrid
              items={[
                { label: "Woningvoorraad", value: fmt(bd.woningmarkt.woningvoorraad) },
                { label: "Koopwoningen", value: pct(bd.woningmarkt.koopwoningen_pct) },
                { label: "Huurwoningen", value: pct(bd.woningmarkt.huurwoningen_pct) },
                {
                  label: "Corporatiewoningen",
                  value: pct(bd.woningmarkt.corporatiewoningen_pct),
                },
                {
                  label: "Gem. WOZ-waarde",
                  value: fmtEur(bd.woningmarkt.gem_woz_waarde_eur),
                },
                {
                  label: "Aardgaswoningen",
                  value: pct(bd.woningmarkt.aardgaswoningen_pct),
                },
                {
                  label: "Aardgasvrije won.",
                  value: pct(bd.woningmarkt.aardgasvrije_woningen_pct),
                },
                {
                  label: "Stadsverwarming",
                  value: pct(bd.woningmarkt.stadsverwarming_pct),
                },
                {
                  label: "Bouwjaar < 10 jr",
                  value: pct(bd.woningmarkt.bouwjaar_afgelopen_10jr_pct),
                },
                {
                  label: "Bouwjaar > 10 jr",
                  value: pct(bd.woningmarkt.bouwjaar_ouder_10jr_pct),
                },
              ]}
            />
          </Section>

          {/* ── Inkomen & Sociaal ── */}
          <Section title="Inkomen & Sociaal" source="CBS Kerncijfers Wijken en Buurten 2024">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Inkomen
                </p>
                <StatGrid
                  items={[
                    {
                      label: "Gem. gestand. inkomen",
                      value: fmtEur(bd.inkomen.gem_gestandaardiseerd_inkomen_eur),
                    },
                    {
                      label: "Gem. inkomen / inwoner",
                      value: fmtEur(bd.inkomen.gem_inkomen_per_inwoner_eur),
                    },
                    {
                      label: "Gem. inkomen / ontvanger",
                      value: fmtEur(bd.inkomen.gem_inkomen_per_ontvanger_eur),
                    },
                    {
                      label: "Mediaan vermogen",
                      value: fmtEur(bd.inkomen.mediaan_vermogen_eur),
                    },
                    {
                      label: "% in armoede",
                      value: pct(bd.inkomen.pct_in_armoede),
                    },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sociale uitkeringen
                </p>
                <StatGrid
                  items={[
                    {
                      label: "Bijstand ontvangers",
                      value: fmt(bd.sociaal.bijstand_ontvangers),
                    },
                    { label: "AOW ontvangers", value: fmt(bd.sociaal.aow_ontvangers) },
                    { label: "WW ontvangers", value: fmt(bd.sociaal.ww_ontvangers) },
                    { label: "AO ontvangers", value: fmt(bd.sociaal.ao_ontvangers) },
                    {
                      label: "% jeugdzorg",
                      value: pct(bd.sociaal.pct_jeugdzorg),
                    },
                    { label: "WMO cliënten", value: fmt(bd.sociaal.wmo_clienten) },
                  ]}
                />
              </div>
            </div>
          </Section>

          {/* ── Bereikbaarheid & Mobiliteit ── */}
          <Section title="Bereikbaarheid" source="CBS Kerncijfers Wijken en Buurten 2024">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Afstanden
                </p>
                <StatGrid
                  items={[
                    {
                      label: "Huisarts",
                      value: fmt(bd.bereikbaarheid.afstand_huisarts_km, "km"),
                    },
                    {
                      label: "Grote supermarkt",
                      value: fmt(bd.bereikbaarheid.afstand_grote_supermarkt_km, "km"),
                    },
                    {
                      label: "Kinderdagverblijf",
                      value: fmt(bd.bereikbaarheid.afstand_kinderdagverblijf_km, "km"),
                    },
                    {
                      label: "Basisschool",
                      value: fmt(bd.bereikbaarheid.afstand_school_km, "km"),
                    },
                    {
                      label: "Scholen binnen 3 km",
                      value: fmt(bd.bereikbaarheid.scholen_binnen_3km),
                    },
                  ]}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mobiliteit
                </p>
                <StatGrid
                  items={[
                    {
                      label: "Personenauto's totaal",
                      value: fmt(bd.mobiliteit.personenautos_totaal),
                    },
                    {
                      label: "Auto's per huishouden",
                      value: fmt(bd.mobiliteit.personenautos_per_hh),
                    },
                    {
                      label: "Benzineauto's",
                      value: fmt(bd.mobiliteit.personenautos_benzine),
                    },
                    {
                      label: "Overige brandstof",
                      value: fmt(bd.mobiliteit.personenautos_overig),
                    },
                    { label: "Motorfietsen", value: fmt(bd.mobiliteit.motorfietsen) },
                  ]}
                />
              </div>
            </div>
          </Section>
        </>
      )}

      {/* ── Klimaat ── */}
      {klm && (
        <Section title="Klimaat & Natuur" source={klm.bron}>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                Wateroverlast
              </p>
              <p className="mt-2 text-lg font-bold text-blue-800">
                {klm.wateroverlast.hoogte_cm !== null
                  ? `${klm.wateroverlast.hoogte_cm} cm`
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-blue-600">
                {klm.wateroverlast.label ?? "Geen data"}
              </p>
            </div>
            <div className="rounded-lg border border-orange-100 bg-orange-50 p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Hittestress
              </p>
              <p className="mt-2 text-lg font-bold text-orange-800">
                {klm.hittestress.hitte_eiland_graad_c !== null
                  ? `+${klm.hittestress.hitte_eiland_graad_c}°C`
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-orange-600">
                {klm.hittestress.label ?? "Geen data"}
              </p>
            </div>
            <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
                Groen
              </p>
              <p className="mt-2 text-lg font-bold text-green-800">
                {pct(klm.groen.percentage)}
              </p>
              <p className="mt-0.5 text-xs text-green-600">Groenpercentage buurt</p>
            </div>
          </div>
        </Section>
      )}

      {/* ── Geluid ── */}
      {gel && (
        <Section title="Geluidbelasting" source={gel.bron}>
          <div className="space-y-2">
            {[
              { label: "Wegverkeer", row: gel.wegverkeer },
              { label: "Spoorweg", row: gel.spoorweg },
              { label: "Industrie", row: gel.industrie },
            ].map(({ label, row }) => (
              <div
                key={label}
                className="flex items-center gap-4 rounded-lg bg-gray-50 px-4 py-2.5"
              >
                <span className="w-28 shrink-0 text-sm font-medium text-gray-700">{label}</span>
                <span
                  className={`text-base font-bold ${
                    row.lden_db === null
                      ? "text-gray-400"
                      : row.lden_db < 45
                      ? "text-green-600"
                      : row.lden_db < 55
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {row.lden_db !== null ? `${row.lden_db} dB` : "—"}
                </span>
                <span className="text-sm text-gray-500">
                  {row.label ?? (row.lden_db === null ? "Buiten geluidscontour" : "")}
                </span>
                <span className="ml-auto text-[10px] italic text-gray-400">{row.data}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Luchtkwaliteit ── */}
      {lk && (
        <Section title="Luchtkwaliteit" source={lk.bron}>
          <div className="space-y-2">
            <AirQualityRow
              label="Stikstofdioxide (NO₂)"
              dataLabel={lk.no2.data}
              value={lk.no2.jaargemiddelde_ug_m3}
              unit="μg/m³"
              whoNorm={lk.normen.who_2021.no2}
              euNorm={lk.normen.eu_2024.no2}
              qualityLabel={lk.no2.label}
              nlGemiddeld={15}
            />
            <AirQualityRow
              label="Fijnstof (PM2,5)"
              dataLabel={lk.pm25.data}
              value={lk.pm25.jaargemiddelde_ug_m3}
              unit="μg/m³"
              whoNorm={lk.normen.who_2021.pm25}
              euNorm={lk.normen.eu_2024.pm25}
              qualityLabel={lk.pm25.label}
              nlGemiddeld={8}
            />
            <AirQualityRow
              label="Fijnstof (PM10)"
              dataLabel={lk.pm10.data}
              value={lk.pm10.jaargemiddelde_ug_m3}
              unit="μg/m³"
              whoNorm={lk.normen.who_2021.pm10}
              euNorm={lk.normen.eu_2024.pm10}
              qualityLabel={lk.pm10.label}
            />
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            WHO 2021 normen: NO₂ {lk.normen.who_2021.no2} · PM2,5 {lk.normen.who_2021.pm25} ·
            PM10 {lk.normen.who_2021.pm10} μg/m³ &nbsp;|&nbsp; EU 2024 normen: NO₂{" "}
            {lk.normen.eu_2024.no2} · PM2,5 {lk.normen.eu_2024.pm25} · PM10{" "}
            {lk.normen.eu_2024.pm10} μg/m³
          </p>
        </Section>
      )}

      {/* ── Bronnen ── */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          Gebruikte databronnen
        </h2>
        <ul className="space-y-0.5">
          {data.meta.bronnen.map((bron, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
              <span className="mt-0.5 shrink-0 text-gray-300">•</span>
              {bron}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] text-gray-400">
          Rapport gegenereerd via het platform van De Vree Makelaardij op{" "}
          {fmtDate(data.meta.gegenereerd_op)}. Data is indicatief en gebaseerd op openbare
          bronnen. Geen rechten te ontlenen aan deze informatie.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BuurtdataPage() {
  const [postcode, setPostcode] = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [huisletter, setHuisletter] = useState("");
  const [toevoeging, setToevoeging] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BuurtdataResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch("/api/buurtdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.replace(/\s/g, "").toUpperCase(),
          huisnummer: parseInt(huisnummer, 10),
          huisletter: huisletter.trim() || null,
          huisnummer_toevoeging: toevoeging.trim() || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Onbekende fout");
        return;
      }

      // Webhook returns an array
      const result = Array.isArray(json) ? json[0] : json;
      if (!result) {
        setError("Geen data ontvangen voor dit adres");
        return;
      }

      setData(result);
    } catch {
      setError("Kan geen verbinding maken met de datadienst");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* ── Form – verborgen bij afdrukken ── */}
      <div className="print-hidden-form mb-8 print:hidden">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Buurtdata</h1>
            <p className="mt-1 text-sm text-gray-500">
              Haal uitgebreide buurt- en omgevingsinformatie op voor elk adres.
            </p>
          </div>
          {data && (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <PrinterIcon className="h-4 w-4" />
              Rapport afdrukken
            </button>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Postcode <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="1234AB"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Huisnummer <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={huisnummer}
                onChange={(e) => setHuisnummer(e.target.value)}
                placeholder="1"
                required
                min="1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Huisletter</label>
              <input
                type="text"
                value={huisletter}
                onChange={(e) => setHuisletter(e.target.value)}
                placeholder="A"
                maxLength={1}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Toevoeging</label>
              <input
                type="text"
                value={toevoeging}
                onChange={(e) => setToevoeging(e.target.value)}
                placeholder="bis"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              {loading ? "Ophalen…" : "Rapport ophalen"}
            </button>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </form>
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex items-center justify-center py-16 print:hidden">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-gray-500">Data ophalen, even geduld…</p>
          </div>
        </div>
      )}

      {/* ── Report ── */}
      {data && !loading && <BuurtdataReport data={data} />}
    </div>
  );
}
