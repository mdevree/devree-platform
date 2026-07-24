import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_GOTENBERG_URL = "http://127.0.0.1:3050";
let cachedLogoDataUri: string | null = null;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function logoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const png = readFileSync(join(process.cwd(), "public", "devree-logo-horizontal.png"));
  cachedLogoDataUri = `data:image/png;base64,${png.toString("base64")}`;
  return cachedLogoDataUri;
}

export function slugPart(value: string | null | undefined): string {
  return (value || "opdracht")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "opdracht";
}

export function euro(value: number | null | undefined): string {
  if (value === null || value === undefined) return "________";
  return `€ ${value.toLocaleString("nl-NL")},-`;
}

export async function renderPdf(html: string): Promise<Buffer> {
  const gotenbergUrl = (process.env.GOTENBERG_URL || DEFAULT_GOTENBERG_URL).replace(/\/$/, "");
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  form.append("preferCssPageSize", "true");

  const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Gotenberg PDF-generatie mislukt (${res.status}): ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export type Opdrachtgever = {
  naam: string;
  achternaam?: string | null;
  aanhef?: string | null;
  initialen?: string | null;
  voornamen?: string | null;
  geboortedatum?: string | null;
  geboorteplaats?: string | null;
  email?: string | null;
  telefoon?: string | null;
  adres?: string | null;
  woonplaats?: string | null;
  postcode?: string | null;
  straat?: string | null;
  postcodePlaats?: string | null;
  burgerlijkeStaat?: string | null;
  rol?: string | null;
};

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function renderPartyField(label: string, value: unknown, { required = false }: { required?: boolean } = {}) {
  if (!required && !hasValue(value)) return "";

  return `
    <div class="party-row">
      <div>${escapeHtml(label)}</div>
      <div>:</div>
      <div>${escapeHtml(value || "……………………………………")}</div>
    </div>
  `;
}

function cleanLegalNamePart(value: string | null | undefined) {
  return value
    ?.replace(/^\s*(?:geachte\s+)?(?:de\s+heer|heer|dhr\.?|mevrouw|mw\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function opdrachtgeverLegalName(opdrachtgever: Opdrachtgever) {
  const juridischeAchternaam = cleanLegalNamePart(opdrachtgever.achternaam || opdrachtgever.naam);
  return [cleanLegalNamePart(opdrachtgever.initialen), juridischeAchternaam]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() || cleanLegalNamePart(opdrachtgever.naam) || opdrachtgever.naam;
}

export function renderOpdrachtgeverBlokken(opdrachtgevers: Opdrachtgever[]) {
  return opdrachtgevers.map((opdrachtgever, index) => {
    const woonplaats = opdrachtgever.woonplaats || opdrachtgever.postcodePlaats?.replace(/^\d{4}\s?[A-Z]{2}\s*/i, "") || null;
    const postcode = opdrachtgever.postcode || opdrachtgever.postcodePlaats?.match(/^\d{4}\s?[A-Z]{2}/i)?.[0] || null;
    const straat = opdrachtgever.straat || opdrachtgever.adres;
    const juridischeNaam = opdrachtgeverLegalName(opdrachtgever);

    return `
      <section class="party-block">
        <p><strong>${opdrachtgevers.length === 1 ? "De opdrachtgever" : `De opdrachtgever ${index + 1}`}</strong></p>
        ${renderPartyField("Naam", juridischeNaam, { required: true })}
        ${renderPartyField("Voornamen", opdrachtgever.voornamen)}
        ${renderPartyField("Geboortedatum", opdrachtgever.geboortedatum)}
        ${renderPartyField("Geboorteplaats", opdrachtgever.geboorteplaats)}
        ${renderPartyField("Woonplaats", woonplaats)}
        ${renderPartyField("Postcode", postcode)}
        ${renderPartyField("Straat", straat)}
        ${renderPartyField("E-mailadres", opdrachtgever.email)}
        ${renderPartyField("Telefoon", opdrachtgever.telefoon)}
        ${renderPartyField("Burgerlijke staat", opdrachtgever.burgerlijkeStaat)}
      </section>
    `;
  }).join("");
}

export function renderHandtekeningen(opdrachtgevers: Opdrachtgever[]) {
  const opdrachtgeverBlocks = opdrachtgevers.map((opdrachtgever, index) => {
    const juridischeNaam = opdrachtgeverLegalName(opdrachtgever);

    return `
      <div class="signature">
        <p class="signature-title">${escapeHtml(opdrachtgevers.length === 1 ? "De opdrachtgever(s)," : `De opdrachtgever ${index + 1},`)}</p>
        <div class="signature-sign-area"></div>
        <p>naam: ${escapeHtml(juridischeNaam || "……………………………………")}</p>
        <p>datum: ……………………………………</p>
      </div>
    `;
  }).join("");

  return `${opdrachtgeverBlocks}
    <div class="signature">
      <p class="signature-title">Het NVM-lid,</p>
      <div class="signature-sign-area"></div>
      <p>naam: De heer M. de Vree</p>
      <p>datum: ……………………………………</p>
    </div>
  `;
}

export const OTD_PDF_CSS = `    @page {
      size: A4;
      margin: 18mm 16mm 20mm;
      @bottom-center {
        content: "Pagina " counter(page) " / " counter(pages);
        color: #6b7280;
        font-size: 9px;
      }
    }
    * { box-sizing: border-box; }
    body {
      color: #11251d;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.45;
      margin: 0;
    }
    header {
      border-bottom: 1px solid #d9e3de;
      margin-bottom: 18px;
      padding-bottom: 12px;
      text-align: center;
    }
    .brand-logo {
      display: block;
      height: 34px;
      margin: 0 auto 6px;
      object-fit: contain;
      width: 170px;
    }
    .subbrand { color: #6b7280; font-size: 10px; margin-top: 2px; }
    h1 {
      color: #005c3f;
      font-size: 21px;
      margin: 14px 0 4px;
    }
    h2 {
      border-bottom: 1px solid #d9e3de;
      color: #005c3f;
      font-size: 13px;
      margin: 18px 0 8px;
      padding-bottom: 4px;
    }
    .muted { color: #6b7280; }
    .article p {
      margin: 0 0 7px;
      text-align: left;
    }
    .article .indent {
      margin-left: 14px;
    }
    .article .appendices {
      columns: 2;
      margin-top: 8px;
    }
    .article .appendices p {
      break-inside: avoid;
      margin-bottom: 3px;
    }
    .party-block {
      border-bottom: 1px solid #edf1ef;
      margin-bottom: 10px;
      padding-bottom: 8px;
      page-break-inside: avoid;
    }
    .party-block p {
      margin: 0 0 5px;
    }
    .party-row {
      display: grid;
      gap: 7px;
      grid-template-columns: 34mm 3mm 1fr;
      margin-bottom: 2px;
    }
    .signatures {
      display: grid;
      gap: 14px;
      grid-template-columns: 1fr 1fr;
      margin-top: 12px;
      page-break-inside: avoid;
    }
    .signature-section {
      break-before: page;
      page-break-before: always;
    }
    .signature {
      border: 1px solid #d9e3de;
      border-radius: 6px;
      min-height: 122px;
      padding: 10px;
    }
    .signature-title {
      color: #005c3f;
      font-weight: 700;
      margin: 0 0 8px;
    }
    .signature-sign-area {
      background: #fff;
      border: 1px dashed #cbd5d1;
      border-radius: 4px;
      height: 34px;
      margin: 0 0 10px;
      width: 100%;
    }
    footer {
      border-top: 1px solid #d9e3de;
      color: #6b7280;
      font-size: 8.5px;
      margin-top: 18px;
      padding-top: 8px;
      text-align: center;
    }`;
