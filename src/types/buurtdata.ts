export interface BuurtdataResult {
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
  radar?: {
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
  } | null;
}
