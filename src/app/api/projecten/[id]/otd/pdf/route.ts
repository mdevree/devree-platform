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

function percentLegal(value: number | null | undefined): string {
  if (value === null || value === undefined) return "________";
  return `${new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)} % incl. BTW`;
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
  voornamen?: string | null;
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

function renderOpdrachtgeverSamenvatting(opdrachtgevers: Opdrachtgever[]) {
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

function renderPartyField(label: string, value: unknown) {
  return `
    <div class="party-row">
      <div>${escapeHtml(label)}</div>
      <div>:</div>
      <div>${escapeHtml(value || "……………………………………")}</div>
    </div>
  `;
}

function renderOpdrachtgeverBlokken(opdrachtgevers: Opdrachtgever[]) {
  return opdrachtgevers.map((opdrachtgever, index) => {
    const woonplaats = opdrachtgever.woonplaats || opdrachtgever.postcodePlaats?.replace(/^\d{4}\s?[A-Z]{2}\s*/i, "") || null;
    const postcode = opdrachtgever.postcode || opdrachtgever.postcodePlaats?.match(/^\d{4}\s?[A-Z]{2}/i)?.[0] || null;
    const straat = opdrachtgever.straat || opdrachtgever.adres;

    return `
      <section class="party-block">
        <p><strong>${opdrachtgevers.length === 1 ? "De opdrachtgever" : `De opdrachtgever ${index + 1}`}</strong></p>
        ${renderPartyField("Naam", opdrachtgever.naam)}
        ${renderPartyField("Voornamen", opdrachtgever.voornamen)}
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

function renderHandtekeningen(opdrachtgevers: Opdrachtgever[]) {
  const opdrachtgeverBlocks = opdrachtgevers.map((opdrachtgever, index) => `
    <div class="signature">
      <p class="signature-title">${escapeHtml(opdrachtgevers.length === 1 ? "De opdrachtgever(s)," : `De opdrachtgever ${index + 1},`)}</p>
      <div class="signature-line"></div>
      <p>naam: ${escapeHtml(opdrachtgever.naam || "……………………………………")}</p>
      <p>plaats: ……………………………………</p>
      <p>datum: ……………………………………</p>
    </div>
  `).join("");

  return `${opdrachtgeverBlocks}
    <div class="signature">
      <p class="signature-title">Het NVM-lid,</p>
      <div class="signature-line"></div>
      <p>naam: De heer M. de Vree</p>
      <p>plaats: ……………………………………</p>
      <p>datum: ……………………………………</p>
    </div>
  `;
}

function buildHtml({
  project,
  opdrachtgevers,
}: {
  project: Awaited<ReturnType<typeof prisma.project.findUnique>>;
  opdrachtgevers: Opdrachtgever[];
}) {
  if (!project) throw new Error("Project ontbreekt");
  const verkoopmethode = project.verkoopmethode
    ? VERKOOPMETHODE_LABELS[project.verkoopmethode] || project.verkoopmethode
    : "……………………………………";
  const objectAdres = [project.woningAdres || project.address, project.woningPostcode, project.woningPlaats]
    .filter(Boolean)
    .join(", ");
  const kadastraal = `gemeente ${project.kadGemeente || "…………………"}, sectie ${project.kadSectie || "……"}, no. ${project.kadNummer || "…………"}, groot ……… m²`;
  const vandaag = new Intl.DateTimeFormat("nl-NL").format(new Date());
  const aanvaarding = project.aanvaarding || "________";
  const vraagprijs = project.vraagprijs ? `${euro(project.vraagprijs)} k.k.` : "________";
  const courtage = percentLegal(project.courtagePercentage);
  const publiciteitskosten = project.kostenPubliciteit ?? 650;
  const intrekkingskosten = project.kostenIntrekking ?? 600;
  const bedenktijdkosten = project.kostenBedenktijd ?? 350;
  const bijzondereAfspraken = project.bijzondereAfspraken?.trim() || "……………………………………………………………………";

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
  </header>

  <h2>De ondergetekende(n)</h2>
  ${renderOpdrachtgeverBlokken(opdrachtgevers)}

  <h2>Contactoverzicht</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Naam</th><th>E-mail</th><th>Telefoon</th><th>Adres</th></tr>
    </thead>
    <tbody>${renderOpdrachtgeverSamenvatting(opdrachtgevers)}</tbody>
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
    ${line("Datum opdracht", vandaag)}
    ${line("Vraagprijs", vraagprijs)}
    ${line("Courtage", percent(project.courtagePercentage))}
    ${line("Aanvaarding", aanvaarding)}
    ${line("Verkoopmethode", verkoopmethode)}
    ${line("Bankrekening", "NL02 RABO 0380 8057 23 t.n.v. De Vree Makelaardij B.V.")}
  </dl>
  ${project.bijzondereAfspraken ? `
    <div class="section-note"><strong>Aanvullende afspraken</strong><br>${escapeHtml(project.bijzondereAfspraken)}</div>
  ` : ""}

  <h2>Opdrachttekst</h2>
  <div class="article">
    <p><strong>Het NVM-lid</strong></p>
    <p>Makelaarskantoor De Vree Makelaardij B.V. te Spijkenisse.</p>
    <p>De opdrachtgever heeft op ${escapeHtml(vandaag)} aan het NVM-lid een door deze aanvaarde opdracht verstrekt tot het verlenen van diensten bij de verkoop van de onroerende zaak:</p>
    <p class="indent">• plaatselijk bekend (incl. postcode): ${escapeHtml(objectAdres || "________")}</p>
    <p class="indent">• kadastraal bekend ${escapeHtml(kadastraal)}</p>
    <p>Met betrekking tot de hoogte van de tarieven zijn de opdrachtgever en het NVM-lid het volgende overeengekomen: Courtage over de gerealiseerde transactieprijs van de woning: ${escapeHtml(courtage)}.</p>
    <p>Op deze opdracht zijn van toepassing de Algemene Consumentenvoorwaarden Makelaardij, d.d. 1 september 2018 (ACV). Hierin zijn de rechten en verplichtingen van de opdrachtgever en het NVM-lid omschreven. De opdrachtgever verklaart dat de tekst van de ACV voor of bij het verstrekken van deze opdracht aan hem ter hand is gesteld. De opdrachtgever heeft zich verbonden tot het betalen van loon voor zover dit uit de met het NVM-lid gemaakte afspraken en de van toepassing verklaarde ACV voortvloeit.</p>
    <p>Tenzij partijen schriftelijk anders afspreken is het de opdrachtgever niet toegestaan activiteiten te ontplooien die de makelaar bij het vervullen van zijn opdracht kunnen hinderen. Indien in strijd met het voorgaande een overeenkomst tot stand komt heeft het NVM-lid recht op loon.</p>
    <p>Op deze opdracht is ook de Erecode NVM van toepassing. Hierin is de gedragscode voor NVM-leden beschreven.</p>
    <p>Klachten worden behandeld volgens de aangehechte NVM Klachtenprocedure.</p>
    <p>Alle uit hoofde van deze opdracht verschuldigde vergoedingen, zullen door opdrachtgever worden overgemaakt op bankrekeningnummer: NL02 RABO 0380 8057 23 ten name van De Vree Makelaardij B.V..</p>
    <p>De opdrachtgever en het NVM-lid zijn verder overeengekomen:</p>
    <p><strong>1.</strong> Tenzij uit doorhalingen anders blijkt, stemt de opdrachtgever ermee in dat:</p>
    <p class="indent"><strong>1.1</strong> Het NVM-lid de opdracht, eventueel met foto's, tekeningen e.d. ter kennis brengt van collega's en derden en dat deze gegevens worden opgenomen in gidsen en andere overzichten waaronder Funda.</p>
    <p class="indent"><strong>1.2</strong> Het NVM-lid kosten maakt zoals hieronder vermeld, die door hem, desgewenst telkens nadat hij deze heeft voldaan, aan de opdrachtgever in rekening worden gebracht en wel, behoudens nadere afspraken, tot in totaal niet meer dan de aangegeven bedragen:</p>
    <p class="indent">– publiciteitskosten (Funda plaatsing compleet, fotopresentatie inclusief 360 graden foto's, video, plattegronden etc.): max. ${escapeHtml(euro(publiciteitskosten))} incl. BTW;</p>
    ${project.kostenEnergielabel && project.kostenEnergielabel > 0 ? `<p class="indent">- energielabel definitief maken: max. ${escapeHtml(euro(project.kostenEnergielabel))} incl. BTW;</p>` : ""}
    <p class="indent"><strong>1.3</strong> De notaris vóór het verlijden van de akte van levering aan het NVM-lid een exemplaar van het concept van die notariële akte en de nota van afrekening ter inzage verstrekt en, indien en voor zover de opdrachtgever op dat moment nog loon, verschotten of andere kosten verschuldigd is, deze bij het passeren van de akte van levering verrekent.</p>
    <p class="indent"><strong>1.4</strong> Voor zover hij zijn eigendomspapieren aan het NVM-lid ter hand heeft gesteld deze bij het tot stand komen van de overeenkomst via de notaris aan de koper ter beschikking worden gesteld.</p>
    <p><strong>2.</strong> Het object is te aanvaarden per ${escapeHtml(aanvaarding)}.</p>
    <p><strong>3.</strong> De vraagprijs is bepaald op ${escapeHtml(vraagprijs)}.</p>
    <p><strong>4.</strong> Met betrekking tot het intrekken van de opdracht door de opdrachtgever zijn partijen overeengekomen dat de opdrachtgever het volgende bedrag is verschuldigd: ${escapeHtml(euro(intrekkingskosten))} incl. BTW, onverminderd het bepaalde in artikel 19 van de op deze opdracht van toepassing zijnde Algemene Consumentenvoorwaarden Makelaardij 2018.</p>
    <p><strong>5.</strong> Wettelijke bedenktijd. Indien deze opdracht op afstand of buiten het kantoor van de makelaar tot stand is gekomen, heeft de opdrachtgever (consument) gedurende veertien dagen na de totstandkoming van de opdracht het recht deze zonder opgaaf van redenen te ontbinden. De opdrachtgever roept dit recht in via het door de makelaar verstrekte formulier of een schriftelijke of elektronische mededeling. Bij ontbinding zijn uitsluitend de daadwerkelijk gemaakte kosten verschuldigd, vermeerderd met het onder 5b genoemde bedrag. Het risico en de bewijslast voor de juiste en tijdige uitoefening van dit recht liggen bij de opdrachtgever. De begrippen "op afstand" en "buiten het kantoor van de makelaar" hebben de betekenis die de wet en de toepasselijke ACV daaraan geven.</p>
    <p><strong>5b.</strong> Bij ontbinding van de opdracht binnen de bedenktijd is de opdrachtgever een bedrag van ${escapeHtml(euro(bedenktijdkosten))} incl. BTW verschuldigd.</p>
    <p><strong>5c.</strong> De opdrachtgever verzoekt de makelaar uitdrukkelijk direct met de dienstverlening te beginnen en stemt ermee in dat bij het inroepen van de bedenktijd de daadwerkelijk gemaakte kosten verschuldigd zijn. Zodra de opdracht binnen de bedenktijd volledig is uitgevoerd, doet de opdrachtgever afstand van het recht op ontbinding.</p>
    <p>Voor akkoord geparafeerd: ……………</p>
    <p><strong>6.</strong> De bijzonderheden die opdrachtgever bekend zijn zullen worden ingevuld in de "Vragenlijst voor de verkoop van een woning".</p>
    <p><strong>7.</strong> Het NVM-lid aanvaardt geen nieuwe opdracht (van een derde) voor een activiteit die direct of indirect verband houdt met het belang van de opdrachtgever, tenzij het NVM-lid de opdrachtgever op de hoogte heeft gesteld van die nieuwe opdracht en samen met de opdrachtgever tot de conclusie is gekomen dat het aanvaarden van die nieuwe opdracht niet strijdig is met het belang van de opdrachtgever.</p>
    <p><strong>8.</strong> Op deze opdracht is het NVM Protocol Transparant Bieden Woonruimte (hierna te noemen "het Protocol") van toepassing, omdat de verkoop van de woning valt binnen het toepassingsgebied van het protocol zoals daarin omschreven. De opdracht wordt uitgevoerd overeenkomstig de procedures, regels en uitgangspunten die in het protocol zijn vermeld. Het protocol is als bijlage opgenomen en verkoper verklaart hiervan kennis te hebben genomen en in te stemmen met het protocol.</p>
    <p>Het protocol kent vier mogelijke verkoopmethoden. Partijen spreken af dat de verkoop wordt opgestart met de verkoopmethode ${escapeHtml(verkoopmethode)}.</p>
    <p>Tijdens het verkoopproces kan blijken dat een andere verkoopmethode beter aansluit bij het behalen van een zo goed mogelijk verkoopresultaat. Partijen kunnen dan in onderling overleg besluiten de gekozen verkoopmethode te wijzigen en over te stappen op een andere verkoopmethode zoals opgenomen in het protocol. Indien partijen hiertoe besluiten, bevestigt de makelaar deze wijziging – inclusief de reden daarvoor – schriftelijk (bijvoorbeeld per e-mail) aan de verkoper. De makelaar informeert tevens alle (potentiële) bieders schriftelijk over de gewijzigde verkoopmethode en de daarbij behorende reden.</p>
    <p><strong>9.</strong> Verwerking van persoonsgegevens. De gegevens van opdrachtgever worden door het NVM-lid en de Nederlandse Coöperatieve Vereniging van Makelaars & Taxateurs in onroerende goederen NVM U.A. veilig opgeslagen en gebruikt in overeenstemming met de privacyverklaring die opdrachtgever als bijlage bij deze opdracht tot dienstverlening heeft ontvangen.</p>
    <p>Daarnaast geeft de opdrachtgever het NVM-lid toestemming om gegevens, documenten en stukken uit deze opdracht – waar mogelijk geanonimiseerd – te gebruiken en te delen in het kader van (permanente) educatie, opleiding, certificering en kwaliteitsborging. Hieronder valt onder meer het beschikbaar stellen van daadwerkelijke gegevens uit de dagelijkse beroepspraktijk aan een certificerende instantie (zoals VastgoedCert) en/of een door deze ingeschakelde exameninstelling ten behoeve van de (her)certificering van de makelaar. Op die verwerking is het privacy statement van de betreffende instantie van toepassing. Deze organisaties is het niet toegestaan de gegevens voor andere doeleinden te gebruiken.</p>
    <p><strong>10.</strong> Aansprakelijkheid en exoneraties. Iedere aansprakelijkheid van het NVM-lid is beperkt tot het bedrag dat in het desbetreffende geval op basis van een door het NVM-lid gesloten beroepsaansprakelijkheidsverzekering daadwerkelijk wordt uitbetaald, vermeerderd met het eigen risico onder die verzekering. Daarnaast geldt:</p>
    <p class="indent">a. Iedere aansprakelijkheid is beperkt tot uitsluitend de opdrachtgever en het doel van de opdracht;</p>
    <p class="indent">b. De hoogte van onze aansprakelijkheid is beperkt tot maximaal het bedrag waartoe wij (op grond van ons lidmaatschap van de NVM) op branche gebruikelijke voorwaarden verplicht verzekerd zijn tegen beroepsaansprakelijkheid;</p>
    <p class="indent">c. Onze aansprakelijkheid eindigt uiterlijk één (1) jaar na de juridische levering van het verkochte.</p>
    <p><strong>11. Bijzondere afspraken:</strong> ${escapeHtml(bijzondereAfspraken)}</p>
    <p>……………………………………………………………………</p>
    <p>……………………………………………………………………</p>
    <p><strong>Bijlagen:</strong></p>
    <div class="appendices">
      <p>1. De Algemene Consumentenvoorwaarden Makelaardij, d.d. 1 september 2018</p>
      <p>2. NVM Klachtenprocedure</p>
      <p>3. Lijst van zaken</p>
      <p>4. Protocol Transparant Bieden Woonruimte</p>
      <p>5. Privacyverklaring</p>
      <p>6. Vragenlijst voor de verkoop van een woning</p>
    </div>
  </div>

  <div class="signature-section">
    <h2>Ondertekening</h2>
    <div class="signatures">
      ${renderHandtekeningen(opdrachtgevers)}
    </div>
    <p class="muted">* doorhalen wat niet van toepassing is.</p>
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
