import type { Project } from "@prisma/client";
import { VERKOOPMETHODE_LABELS } from "@/lib/projectTypes";
import {
  escapeHtml,
  euro,
  logoDataUri,
  renderHandtekeningen,
  renderOpdrachtgeverBlokken,
  OTD_PDF_CSS,
  type Opdrachtgever,
} from "./shared";

function percentLegal(value: number | null | undefined): string {
  if (value === null || value === undefined) return "________";
  return `${new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)} % incl. BTW`;
}

function formatAanvaarding(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "________";

  const normalized = trimmed
    .replace(/\s+/g, " ")
    .replace(/\b(?:per|vanaf)\s+/i, "");
  const isDateLike =
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(normalized)
    || /^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)
    || /^\d{1,2}\s+(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{4}$/i.test(normalized);

  return isDateLike ? `voorkeur: ${trimmed}` : trimmed;
}

export function buildVerkoopHtml({
  project,
  opdrachtgevers,
}: {
  project: Project | null;
  opdrachtgevers: Opdrachtgever[];
}) {
  if (!project) throw new Error("Project ontbreekt");
  const verkoopmethode = project.verkoopmethode
    ? VERKOOPMETHODE_LABELS[project.verkoopmethode] || project.verkoopmethode
    : "……………………………………";
  const objectAdres = [project.woningAdres || project.address, project.woningPostcode, project.woningPlaats]
    .filter(Boolean)
    .join(", ");
  const kadastraal = `gemeente ${project.kadGemeente || "…………………"}, sectie ${project.kadSectie || "……"}, no. ${project.kadNummer || "…………"}, groot ${project.kadGrootte || "………"} m²`;
  const logo = logoDataUri();
  const vandaag = new Intl.DateTimeFormat("nl-NL").format(new Date());
  const aanvaarding = formatAanvaarding(project.aanvaarding);
  const vraagprijs = project.vraagprijs ? `${euro(project.vraagprijs)} k.k.` : "________";
  const courtage = percentLegal(project.courtagePercentage);
  const publiciteitskosten = project.kostenPubliciteit;
  const energielabelKosten = project.kostenEnergielabel;
  const quickscanKosten = project.kostenBouwkundig && project.kostenBouwkundig > 0 ? project.kostenBouwkundig : 0;
  const intrekkingskosten = project.kostenIntrekking ?? 600;
  const bedenktijdkosten = project.kostenBedenktijd ?? 350;
  const bijzondereAfspraken = project.bijzondereAfspraken?.trim();
  const kostenRegels = [
    publiciteitskosten && publiciteitskosten > 0
      ? `<p class="indent">- publiciteitskosten (Funda plaatsing compleet, fotopresentatie inclusief 360 graden foto's, video, plattegronden etc.): max. ${escapeHtml(euro(publiciteitskosten))} incl. BTW;</p>`
      : "",
    energielabelKosten && energielabelKosten > 0
      ? `<p class="indent">- energielabel definitief maken of regelen via het NVM-lid: max. ${escapeHtml(euro(energielabelKosten))} incl. BTW;</p>`
      : "",
    quickscanKosten > 0
      ? `<p class="indent">- quickscan fundering laten uitvoeren via het NVM-lid: max. ${escapeHtml(euro(quickscanKosten))} incl. BTW;</p>`
      : "",
  ].filter(Boolean);
  const kostenTekst = kostenRegels.length
    ? kostenRegels.join("")
    : `<p class="indent">- er worden geen afzonderlijke publiciteits-, energielabel- of quickscankosten aan opdrachtgever doorbelast.</p>`;
  const bijzondereAfsprakenHtml = bijzondereAfspraken
    ? `<p><strong>11. Bijzondere afspraken:</strong> ${escapeHtml(bijzondereAfspraken)}</p>`
    : `<p><strong>11. Bijzondere afspraken:</strong></p>
    <p>……………………………………………………………………</p>
    <p>……………………………………………………………………</p>`;

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Opdracht tot dienstverlening</title>
  <style>
${OTD_PDF_CSS}
  </style>
</head>
<body>
  <header>
    <img class="brand-logo" src="${logo}" alt="De Vree Makelaardij">
    <div class="subbrand">Uw belang is ons belang</div>
    <h1>Opdracht tot dienstverlening bij verkoop</h1>
  </header>

  <h2>De ondergetekende(n)</h2>
  ${renderOpdrachtgeverBlokken(opdrachtgevers)}

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
    ${kostenTekst}
    <p class="indent"><strong>1.3</strong> De notaris vóór het verlijden van de akte van levering aan het NVM-lid een exemplaar van het concept van die notariële akte en de nota van afrekening ter inzage verstrekt en, indien en voor zover de opdrachtgever op dat moment nog loon, verschotten of andere kosten verschuldigd is, deze bij het passeren van de akte van levering verrekent.</p>
    <p class="indent"><strong>1.4</strong> Voor zover hij zijn eigendomspapieren aan het NVM-lid ter hand heeft gesteld deze bij het tot stand komen van de overeenkomst via de notaris aan de koper ter beschikking worden gesteld.</p>
    <p><strong>2.</strong> Het object is te aanvaarden per ${escapeHtml(aanvaarding)}.</p>
    <p><strong>3.</strong> De vraagprijs is bepaald op ${escapeHtml(vraagprijs)}.</p>
    <p><strong>4.</strong> Met betrekking tot het intrekken van de opdracht door de opdrachtgever zijn partijen overeengekomen dat de opdrachtgever het volgende bedrag is verschuldigd: ${escapeHtml(euro(intrekkingskosten))} incl. BTW, onverminderd het bepaalde in artikel 19 van de op deze opdracht van toepassing zijnde Algemene Consumentenvoorwaarden Makelaardij 2018.</p>
    <p><strong>5.</strong> Wettelijke bedenktijd. Indien deze opdracht op afstand of buiten het kantoor van de makelaar tot stand is gekomen, heeft de opdrachtgever (consument) gedurende veertien dagen na de totstandkoming van de opdracht het recht deze zonder opgaaf van redenen te ontbinden. De opdrachtgever roept dit recht in via het door de makelaar verstrekte formulier of een schriftelijke of elektronische mededeling. Bij ontbinding zijn uitsluitend de daadwerkelijk gemaakte kosten verschuldigd, vermeerderd met het onder 5b genoemde bedrag. Het risico en de bewijslast voor de juiste en tijdige uitoefening van dit recht liggen bij de opdrachtgever. De begrippen "op afstand" en "buiten het kantoor van de makelaar" hebben de betekenis die de wet en de toepasselijke ACV daaraan geven.</p>
    <p><strong>5b.</strong> Bij ontbinding van de opdracht binnen de bedenktijd is de opdrachtgever een bedrag van ${escapeHtml(euro(bedenktijdkosten))} incl. BTW verschuldigd.</p>
    <p><strong>5c.</strong> De opdrachtgever verzoekt de makelaar uitdrukkelijk direct met de dienstverlening te beginnen en stemt ermee in dat bij het inroepen van de bedenktijd de daadwerkelijk gemaakte kosten verschuldigd zijn. Zodra de opdracht binnen de bedenktijd volledig is uitgevoerd, doet de opdrachtgever afstand van het recht op ontbinding.</p>
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
    ${bijzondereAfsprakenHtml}
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
