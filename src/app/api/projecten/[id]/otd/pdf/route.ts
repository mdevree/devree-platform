import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { getContactFull } from "@/lib/mautic";
import { VERKOOPMETHODE_LABELS } from "@/lib/projectTypes";

const DEFAULT_GOTENBERG_URL = "http://127.0.0.1:3050";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugPart(value: string | null | undefined): string {
  return (value || "opdracht")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "opdracht";
}

function euro(value: number | null | undefined): string {
  if (value === null || value === undefined) return "________";
  return `€ ${value.toLocaleString("nl-NL")},-`;
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "________";
  return `${new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)}% inclusief btw`;
}

function line(label: string, value: unknown) {
  return `
    <div class="field">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "________")}</dd>
    </div>
  `;
}

async function renderPdf(html: string): Promise<Buffer> {
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

type Opdrachtgever = {
  naam: string;
  email?: string | null;
  telefoon?: string | null;
  adres?: string | null;
  postcodePlaats?: string | null;
  rol?: string | null;
};

function renderOpdrachtgevers(opdrachtgevers: Opdrachtgever[]) {
  return opdrachtgevers.map((opdrachtgever, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>
        <strong>${escapeHtml(opdrachtgever.naam)}</strong>
        ${opdrachtgever.rol ? `<br><span>${escapeHtml(opdrachtgever.rol)}</span>` : ""}
      </td>
      <td>${escapeHtml(opdrachtgever.email || "________")}</td>
      <td>${escapeHtml(opdrachtgever.telefoon || "________")}</td>
      <td>
        ${escapeHtml(opdrachtgever.adres || "________")}
        <br>${escapeHtml(opdrachtgever.postcodePlaats || "________")}
      </td>
    </tr>
  `).join("");
}

function renderHandtekeningen(opdrachtgevers: Opdrachtgever[]) {
  return [
    ...opdrachtgevers.map((opdrachtgever, index) => ({
      title: opdrachtgevers.length === 1 ? "De opdrachtgever" : `Opdrachtgever ${index + 1}`,
      name: opdrachtgever.naam,
    })),
    { title: "Het NVM-lid", name: "De heer M. de Vree" },
  ].map((block) => `
    <div class="signature">
      <p class="signature-title">${escapeHtml(block.title)}</p>
      <div class="signature-line"></div>
      <p>${escapeHtml(block.name)}</p>
      <p>Plaats/datum: ______________________________</p>
    </div>
  `).join("");
}

function buildHtml({
  project,
  opdrachtgevers,
}: {
  project: Awaited<ReturnType<typeof prisma.project.findUnique>>;
  opdrachtgevers: Opdrachtgever[];
}) {
  if (!project) throw new Error("Project ontbreekt");
  const directCosts = [
    { label: "Publiciteitskosten", value: project.kostenPubliciteit },
    { label: "Energielabel definitief maken", value: project.kostenEnergielabel },
    { label: "Juridisch", value: project.kostenJuridisch },
    { label: "Bouwkundig", value: project.kostenBouwkundig },
  ].filter((row) => row.value !== null && row.value !== undefined);
  const directTotal = directCosts.reduce((sum, row) => sum + (row.value || 0), 0);
  const verkoopmethode = project.verkoopmethode
    ? VERKOOPMETHODE_LABELS[project.verkoopmethode] || project.verkoopmethode
    : "________";
  const objectAdres = [project.woningAdres || project.address, project.woningPostcode, project.woningPlaats]
    .filter(Boolean)
    .join(", ");
  const kadastraal = [
    project.kadGemeente && `gemeente ${project.kadGemeente}`,
    project.kadSectie && `sectie ${project.kadSectie}`,
    project.kadNummer && `nummer ${project.kadNummer}`,
  ].filter(Boolean).join(", ");

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Opdracht tot dienstverlening</title>
  <style>
    @page {
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
    .brand {
      color: #005c3f;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: .2px;
    }
    .subbrand { color: #6b7280; font-size: 10px; margin-top: 2px; }
    h1 {
      color: #005c3f;
      font-size: 21px;
      margin: 14px 0 4px;
    }
    .concept {
      border: 1px solid #d9e3de;
      border-radius: 6px;
      color: #005c3f;
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .4px;
      margin-top: 8px;
      padding: 3px 8px;
      text-transform: uppercase;
    }
    h2 {
      border-bottom: 1px solid #d9e3de;
      color: #005c3f;
      font-size: 13px;
      margin: 18px 0 8px;
      padding-bottom: 4px;
    }
    table { border-collapse: collapse; width: 100%; }
    th {
      background: #f3f7f5;
      color: #315246;
      font-size: 9px;
      text-align: left;
      text-transform: uppercase;
    }
    th, td {
      border-bottom: 1px solid #edf1ef;
      padding: 6px 7px;
      vertical-align: top;
    }
    dl.grid {
      display: grid;
      gap: 8px 14px;
      grid-template-columns: 1fr 1fr;
      margin: 0;
    }
    .field dt {
      color: #6b7280;
      font-size: 9px;
      margin-bottom: 1px;
    }
    .field dd {
      font-weight: 600;
      margin: 0;
    }
    .muted { color: #6b7280; }
    .section-note {
      background: #f8faf9;
      border-left: 3px solid #005c3f;
      margin-top: 8px;
      padding: 8px 10px;
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
      min-height: 112px;
      padding: 10px;
    }
    .signature-title {
      color: #005c3f;
      font-weight: 700;
      margin: 0 0 26px;
    }
    .signature-line {
      border-top: 1px solid #11251d;
      margin-bottom: 8px;
      width: 100%;
    }
    footer {
      border-top: 1px solid #d9e3de;
      color: #6b7280;
      font-size: 8.5px;
      margin-top: 18px;
      padding-top: 8px;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">De Vree Makelaardij</div>
    <div class="subbrand">NVM Makelaar in Spijkenisse en omgeving</div>
    <h1>Opdracht tot dienstverlening bij verkoop</h1>
    <div class="concept">Concept ter controle</div>
  </header>

  <h2>Opdrachtgever(s)</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Naam</th><th>E-mail</th><th>Telefoon</th><th>Adres</th></tr>
    </thead>
    <tbody>${renderOpdrachtgevers(opdrachtgevers)}</tbody>
  </table>

  <h2>Object</h2>
  <dl class="grid">
    ${line("Plaatselijk bekend", objectAdres)}
    ${line("Kadastrale aanduiding", kadastraal)}
    ${line("Woonoppervlakte", project.woningOppervlakte ? `${project.woningOppervlakte} m²` : null)}
    ${line("Realworks ID", project.realworksId)}
  </dl>

  <h2>Afspraken</h2>
  <dl class="grid">
    ${line("Datum opdracht", new Intl.DateTimeFormat("nl-NL").format(new Date()))}
    ${line("Vraagprijs", euro(project.vraagprijs))}
    ${line("Courtage", percent(project.courtagePercentage))}
    ${line("Aanvaarding", project.aanvaarding)}
    ${line("Verkoopmethode", verkoopmethode)}
    ${line("Bankrekening", "NL02 RABO 0380 8057 23 t.n.v. De Vree Makelaardij B.V.")}
  </dl>
  ${project.bijzondereAfspraken ? `
    <div class="section-note"><strong>Aanvullende afspraken</strong><br>${escapeHtml(project.bijzondereAfspraken)}</div>
  ` : ""}

  <h2>Kosten en voorwaarden</h2>
  <table>
    <tbody>
      ${directCosts.map((row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td style="text-align:right">${row.value === 0 ? "Niet nodig" : euro(row.value)}</td>
        </tr>
      `).join("")}
      <tr>
        <td><strong>Totaal directe kosten</strong></td>
        <td style="text-align:right"><strong>${euro(directTotal)}</strong></td>
      </tr>
    </tbody>
  </table>
  <table style="margin-top:10px">
    <tbody>
      <tr><td>Bij intrekking van de opdracht</td><td style="text-align:right">${euro(project.kostenIntrekking)}</td></tr>
      <tr><td>Bij ontbinding binnen bedenktijd</td><td style="text-align:right">${euro(project.kostenBedenktijd)}</td></tr>
    </tbody>
  </table>

  <h2>Standaardbepalingen</h2>
  <p>
    Op deze opdracht zijn de gebruikelijke NVM-bepalingen, privacyafspraken, aansprakelijkheidsbeperkingen,
    het Protocol Transparant Bieden en de in de opdracht genoemde bijlagen van toepassing.
  </p>
  <p class="muted">
    Dit document is automatisch voorbereid vanuit het platform. Controleer ontbrekende persoonsgegevens,
    kadastrale gegevens, vraagprijs, verkoopmethode, aanvaarding en aanvullende afspraken voor verzending.
  </p>

  <div class="signature-section">
    <h2>Ondertekening</h2>
    <div class="signatures">
      ${renderHandtekeningen(opdrachtgevers)}
    </div>
  </div>

  <footer>
    De Zoom 3-5, 3207 BX Spijkenisse · 0181-611919 · info@devreemakelaardij.nl · www.devreemakelaardij.nl<br>
    KvK 67381954 · BTW NL857000892B01 · IBAN NL02 RABO 0380 8057 23
  </footer>
</body>
</html>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await isAuthorized(request)) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      contacts: {
        where: { role: { in: ["opdrachtgever", "partner", "gemachtigde"] } },
        orderBy: { addedAt: "asc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const contactDetails = await Promise.all(
    project.contacts.map(async (link) => {
      const contact = await getContactFull(link.mauticContactId).catch(() => null);
      const name = [contact?.firstname, contact?.lastname].filter(Boolean).join(" ") || link.label || `Mautic ${link.mauticContactId}`;
      return {
        naam: name,
        email: contact?.email ?? null,
        telefoon: contact?.mobile || contact?.phone || null,
        adres: contact?.address1 ?? null,
        postcodePlaats: [contact?.zipcode, contact?.city].filter(Boolean).join(" ") || null,
        rol: link.role,
      };
    }),
  );

  const opdrachtgevers = contactDetails.length
    ? contactDetails
    : [{
        naam: project.contactName || "________",
        email: project.contactEmail,
        telefoon: project.contactPhone,
        adres: null,
        postcodePlaats: null,
        rol: "opdrachtgever",
      }];

  const html = buildHtml({ project, opdrachtgevers });
  const pdf = await renderPdf(html);
  const filename = `Opdracht_tot_dienstverlening_${slugPart(project.woningAdres || project.name)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
