import type { Project } from "@prisma/client";
import { AANKOOP_WERKZAAMHEDEN, type AankoopTarieven } from "@/lib/otdAankoop";
import {
  escapeHtml,
  euro,
  logoDataUri,
  renderHandtekeningen,
  renderOpdrachtgeverBlokken,
  OTD_PDF_CSS,
  type Opdrachtgever,
} from "./shared";

export function buildAankoopHtml({
  project,
  opdrachtgevers,
  tarieven,
}: {
  project: Project | null;
  opdrachtgevers: Opdrachtgever[];
  tarieven: AankoopTarieven;
}) {
  if (!project) throw new Error("Project ontbreekt");
  const logo = logoDataUri();
  const vandaag = new Intl.DateTimeFormat("nl-NL").format(new Date());
  const bijzondereAfspraken = project.bijzondereAfspraken?.trim();
  const werkzaamheden = AANKOOP_WERKZAAMHEDEN
    .map((taak) => `<p class="indent">- ${escapeHtml(taak)}</p>`)
    .join("\n    ");
  const bijzondereAfsprakenHtml = bijzondereAfspraken
    ? `<p><strong>9. Bijzondere afspraken:</strong> ${escapeHtml(bijzondereAfspraken)}</p>`
    : `<p><strong>9. Bijzondere afspraken:</strong></p>
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
    <h1>Opdracht tot dienstverlening bij aankoop</h1>
  </header>

  <h2>De ondergetekende(n)</h2>
  ${renderOpdrachtgeverBlokken(opdrachtgevers)}

  <div class="article">
    <p><strong>Het NVM-lid</strong></p>
    <p>Makelaarskantoor De Vree Makelaardij B.V. te Spijkenisse.</p>
    <p>De opdrachtgever heeft op ${escapeHtml(vandaag)} aan het NVM-lid een door deze aanvaarde opdracht verstrekt tot het verlenen van diensten bij de aankoop van een woonobject waaromtrent hieronder nadere bijzonderheden zijn vermeld.</p>
    <p>Met betrekking tot de hoogte van de tarieven zijn de opdrachtgever en het NVM-lid het volgende overeengekomen: ${escapeHtml(euro(tarieven.vastTarief))} incl. BTW. Dit bedrag geldt voor bezichtigingen en onderzoek binnen ${escapeHtml(tarieven.werkgebied)} en omvat maximaal ${escapeHtml(String(tarieven.maxWoningen))} onroerende zaken. Voor elke woning daarboven geldt een toeslag van ${escapeHtml(euro(tarieven.toeslagExtraWoning))} incl. BTW per woning. Voor bezichtigingen buiten het werkgebied worden vooraf aanvullende afspraken gemaakt.</p>
    <p>Op deze opdracht zijn van toepassing de Algemene Consumentenvoorwaarden Makelaardij, d.d. 1 september 2018 (ACV). Hierin zijn de rechten en verplichtingen van de opdrachtgever en het NVM-lid omschreven. In aanvulling op de Algemene Consumentenvoorwaarden zijn de Aankoopvoorwaarden 2026 van toepassing. De opdrachtgever verklaart dat de tekst van deze uitgaven voor of bij het verstrekken van deze opdracht aan hem ter hand is gesteld. De opdrachtgever heeft zich verbonden tot het betalen van loon voor zover dit uit de met het NVM-lid gemaakte afspraken en de van toepassing verklaarde ACV voortvloeit.</p>
    <p>Tenzij partijen schriftelijk anders afspreken is het de opdrachtgever niet toegestaan activiteiten te ontplooien die de makelaar bij het vervullen van zijn opdracht kunnen hinderen. Indien in strijd met het voorgaande een overeenkomst tot stand komt heeft het NVM-lid recht op loon.</p>
    <p>Op deze opdracht is ook de Erecode NVM van toepassing. Hierin is de gedragscode voor NVM-leden beschreven.</p>
    <p>Klachten worden behandeld volgens de aangehechte NVM Klachtenprocedure.</p>
    <p>Alle uit hoofde van deze opdracht verschuldigde vergoedingen, zullen door opdrachtgever worden overgemaakt op bankrekeningnummer: NL02 RABO 0380 8057 23 ten name van De Vree Makelaardij B.V..</p>
    <p>De opdrachtgever en het NVM-lid zijn verder overeengekomen:</p>
    <p><strong>1.</strong> Het NVM-lid verricht de navolgende werkzaamheden voor opdrachtgever:</p>
    ${werkzaamheden}
    <p><strong>2.</strong> Met betrekking tot het intrekken van de opdracht door de opdrachtgever zijn partijen overeengekomen dat de opdrachtgever het volgende bedrag is verschuldigd: ${escapeHtml(euro(tarieven.intrekking))} incl. BTW, onverminderd het bepaalde in artikel 19 van de op deze opdracht van toepassing zijnde Algemene Consumentenvoorwaarden Makelaardij 2018.</p>
    <p><strong>3.</strong> Wettelijke bedenktijd. Indien deze opdracht op afstand of buiten het kantoor van de makelaar tot stand is gekomen, heeft de opdrachtgever (consument) gedurende veertien dagen na de totstandkoming van de opdracht het recht deze zonder opgaaf van redenen te ontbinden. De opdrachtgever roept dit recht in via het door de makelaar verstrekte formulier of een schriftelijke of elektronische mededeling. Bij ontbinding zijn uitsluitend de daadwerkelijk gemaakte kosten verschuldigd, vermeerderd met het onder 3b genoemde bedrag. Het risico en de bewijslast voor de juiste en tijdige uitoefening van dit recht liggen bij de opdrachtgever. De begrippen "op afstand" en "buiten het kantoor van de makelaar" hebben de betekenis die de wet en de toepasselijke ACV daaraan geven.</p>
    <p><strong>3b.</strong> Bij ontbinding van de opdracht binnen de bedenktijd is de opdrachtgever een bedrag van ${escapeHtml(euro(tarieven.bedenktijd))} incl. BTW verschuldigd.</p>
    <p><strong>3c.</strong> De opdrachtgever verzoekt de makelaar uitdrukkelijk direct met de dienstverlening te beginnen en stemt ermee in dat bij het inroepen van de bedenktijd de daadwerkelijk gemaakte kosten verschuldigd zijn. Zodra de opdracht binnen de bedenktijd volledig is uitgevoerd, doet de opdrachtgever afstand van het recht op ontbinding.</p>
    <p><strong>4.</strong> De opdrachtgever stemt ermee in dat de notaris vóór het verlijden van de akte van levering aan het NVM-lid een exemplaar van het concept van die notariële akte en de nota van afrekening ter inzage verstrekt en, indien en voor zover de opdrachtgever op dat moment nog loon, verschotten of andere kosten die opdrachtgever aan het NVM-lid verschuldigd is, deze bij het passeren van de akte van levering verrekent.</p>
    <p><strong>5.</strong> Het NVM-lid aanvaardt geen nieuwe opdracht (van een derde) voor een activiteit die direct of indirect verband houdt met het belang van de opdrachtgever, tenzij het NVM-lid de opdrachtgever op de hoogte heeft gesteld van die nieuwe opdracht en samen met de opdrachtgever tot de conclusie is gekomen dat het aanvaarden van die nieuwe opdracht niet strijdig is met het belang van de opdrachtgever.</p>
    <p><strong>6.</strong> Verwerking van persoonsgegevens. De gegevens van opdrachtgever worden door het NVM-lid en de Nederlandse Coöperatieve Vereniging van Makelaars & Taxateurs in onroerende goederen NVM U.A. veilig opgeslagen en gebruikt in overeenstemming met de privacyverklaring die opdrachtgever als bijlage bij deze opdracht tot dienstverlening heeft ontvangen.</p>
    <p><strong>7.</strong> Aansprakelijkheid en exoneraties. Iedere aansprakelijkheid van het NVM-lid is beperkt tot het bedrag dat in het desbetreffende geval op basis van een door het NVM-lid gesloten beroepsaansprakelijkheidsverzekering daadwerkelijk wordt uitbetaald, vermeerderd met het eigen risico onder die verzekering.</p>
    <p><strong>8.</strong> Indien een door het NVM-lid namens opdrachtgever uitgebracht bod mondeling of schriftelijk wordt geaccepteerd door de verkopende partij en opdrachtgever vervolgens besluit de aankoop niet door te zetten, is opdrachtgever een vergoeding verschuldigd van ${escapeHtml(euro(tarieven.nietDoorzetten))} incl. BTW. De aankoopopdracht loopt in dat geval onverminderd door.</p>
    ${bijzondereAfsprakenHtml}
    <p><strong>Bijlagen:</strong></p>
    <div class="appendices">
      <p>1. De Algemene Consumentenvoorwaarden Makelaardij, d.d. 1 september 2018</p>
      <p>2. Aankoopvoorwaarden 2026</p>
      <p>3. NVM Klachtenprocedure</p>
      <p>4. Privacyverklaring</p>
    </div>
  </div>

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
