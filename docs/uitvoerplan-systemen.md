# Uitvoerplan systemen

Laatst bijgewerkt: 2026-07-12.

Dit document beschrijft de volgende stappen om de De Vree Makelaardij systemen
beheerbaarder, betrouwbaarder en efficienter te maken. De volgorde is bewust:
eerst bron en controle, daarna automatisering.

## Werkafspraken

- Verwijder geen lokale mappen voordat unieke wijzigingen zijn uitgesloten.
- Commit kleine, uitlegbare stappen.
- Zet klantgevoelige flows niet automatisch live zonder test en menselijke
  controle.
- Bewaar secrets nooit in Git.
- Noteer productiechecks direct in `docs/systemen-overzicht.md`.

## Stap 1: GitHub toegang en live revision gelijk trekken

Doel: lokaal, GitHub en productie kunnen betrouwbaar met elkaar vergeleken
worden.

Acties:

1. Herstel lokale GitHub SSH-toegang voor `git@github.com:mdevree/devree-platform.git`.
2. Controleer daarna:

   ```bash
   ssh -T git@github.com
   git fetch --all --prune
   git rev-parse origin/main
   git log --oneline --decorate --max-count=20 origin/main
   ```

3. Vergelijk `origin/main` met de live image revision:

   ```bash
   git cat-file -t 3741a1f983cf7d1f4c0907a36d472182172d54eb
   git show --no-patch --oneline 3741a1f983cf7d1f4c0907a36d472182172d54eb
   ```

4. Als live nieuwer is dan lokaal: fetch oplossen voordat er verder wordt
   gebouwd.
5. Als lokaal wijzigingen bevat: eerst reviewen en logisch opsplitsen.

Klaar wanneer:

- `git fetch` werkt.
- De live commit lokaal bekend is.
- Duidelijk is of lokale wijzigingen bovenop live, achter live of naast live
  staan.

## Stap 2: lokale platformwijzigingen reviewen

Doel: voorkomen dat half-afgeronde lokale wijzigingen per ongeluk verdwijnen of
door elkaar worden gecommit.

Acties:

1. Maak een overzicht:

   ```bash
   git status --short
   git diff --stat
   ```

2. Groepeer wijzigingen per onderwerp, bijvoorbeeld:
   - OTD/voorstel-flow;
   - Documenso;
   - Mautic;
   - proposal tracking;
   - documentatie;
   - gegenereerde output.
3. Controleer untracked mappen zoals `cnc-output/` en `output/`.
4. Bepaal per groep:
   - committen;
   - tijdelijk bewaren;
   - negeren via `.gitignore`;
   - verwijderen alleen na expliciete keuze.
5. Draai minimaal:

   ```bash
   npm run typecheck
   npm test
   ```

Klaar wanneer:

- De werkboom is verklaard.
- Belangrijke wijzigingen staan in logische commits of zijn bewust apart gezet.

## Stap 3: productie child theme opschonen

Doel: WordPress child theme productie weer reproduceerbaar maken vanuit GitHub.

Acties:

1. Inspecteer op de server:

   ```bash
   ssh -i ~/.ssh/devree_codex DeVreeMakelaardij@136.144.253.219
   cd /home/DeVreeMakelaardij/web/devreemakelaardij.nl/public_html/wp-content/themes/kadence-child
   git status --short
   git diff --stat
   ```

2. Review de lokale wijzigingen.
3. Bepaal per wijziging:
   - bewust productiegedrag: commit en push;
   - tijdelijk/debug: verwijderen of apart documenteren;
   - gegenereerd/cache: uit Git houden.
4. Test de website visueel na eventuele child theme wijzigingen.
5. Flush indien nodig FVM cache:

   ```bash
   rm -rf /home/DeVreeMakelaardij/web/devreemakelaardij.nl/public_html/wp-content/cache/fvm/
   ```

Status op 2026-07-12:

- `functions.php` is gecommit en gepusht naar `mdevree/devree-kadence-child`
  als `8451e67`.
- Alleen untracked backupbestanden rond Calendly blijven nog op de server staan.

Klaar wanneer:

- Productie child theme heeft geen onverklaarde lokale wijzigingen.
- GitHub bevat de bewuste live wijzigingen.

## Stap 4: lokale kopieen classificeren

Doel: duidelijk krijgen welke mappen werkmappen, backups of bronnen zijn.

Te controleren mappen:

- `DeVreeMakelaardij-marketobjects`
- `devree-platform-dashboard-work2`
- `devree-platform-dashboard-work`
- `devree-realworks-browserext`
- `DeVreePBX`
- `devree_youtube_edit`
- `ha-umbrel-config`

Acties:

1. Maak per map een korte notitie:
   - doel;
   - laatste wijzigingsdatum;
   - wel/niet Git;
   - unieke bestanden;
   - bewaren of archiveerbaar.
2. Vergelijk platformkopieen met de hoofdrepo op relevante mappen:
   - `src/`
   - `prisma/`
   - `n8n/`
   - `browserext/`
   - `pbx/`
3. Zet de conclusie in `docs/systemen-overzicht.md`.

Klaar wanneer:

- Niemand hoeft meer te raden welke lokale map leidend is.
- Archiveerbare mappen zijn benoemd, maar nog niet verwijderd zonder akkoord.

## Stap 5: GitHub Actions veiliger maken

Doel: productie pas deployen na checks.

Acties:

1. Breid `.github/workflows/deploy.yml` uit met aparte checkstappen voor de
   Docker build:

   ```bash
   npm ci
   npm run lint
   npm run typecheck
   npm test
   ```

2. Laat Docker build/deploy alleen doorgaan als deze stappen slagen.
3. Houd rollback in `deploy-devree-platform` actief.
4. Leg in `docs/deployment.md` vast wat de pipeline doet.

Klaar wanneer:

- Een typecheck- of testfout blokkeert productie.
- Deploylogs blijven de image tag en healthcheck tonen.

## Stap 6: systeemcontrole uitbreiden

Doel: `/systeemcontrole` wordt de cockpit voor kantoor en beheer.

Acties:

1. Voeg buildmetadata toe aan het platform:
   - commit-SHA;
   - buildtijd;
   - image tag.
2. Voeg health endpoints toe voor:
   - PBX bridge;
   - n8n webhook bereikbaarheid;
   - Documenso;
   - Gotenberg;
   - Mautic;
   - WhatsApp provider;
   - Realworks queues.
3. Toon per systeem:
   - status;
   - laatste succes;
   - laatste fout;
   - aanbevolen herstelactie.
4. Voeg waarschuwingen toe:
   - open quarantaine;
   - failed Realworks writes;
   - geen recente agenda-sync;
   - oude extensieversie;
   - PBX bridge down.

Klaar wanneer:

- Op een pagina zichtbaar is welke keten aandacht nodig heeft.
- Fouten niet alleen technisch zijn, maar ook een herstelrichting tonen.

## Stap 7: integratiecontracten vastleggen

Doel: minder breuk door veranderende payloads tussen Realworks, n8n en platform.

Acties:

1. Maak `docs/contracts/`.
2. Start met deze contracten:
   - `realworks-woning.md`
   - `realworks-kadaster.md`
   - `realworks-agenda.md`
   - `realworks-lead-response.md`
   - `ai-caller-start.md`
   - `ai-caller-result.md`
   - `documenso-webhook.md`
   - `whatsapp-webhook.md`
3. Beschrijf per contract:
   - richting;
   - trigger;
   - authenticatie;
   - verplicht payloadschema;
   - optionele velden;
   - foutgedrag;
   - voorbeeldpayload.
4. Voeg daarna schema-validatie toe in platformroutes.

Klaar wanneer:

- Nieuwe payloadvarianten veilig worden geweigerd, genegeerd of in quarantaine
  gezet.
- n8n en platform op dezelfde contractdocumentatie werken.

## Stap 8: Realworks-extensie verbeteren

Doel: Realworks-sync wordt traceerbaar en minder kwetsbaar.

Acties:

1. Bepaal of `browserext/` in de platformrepo of
   `devree-realworks-browserext` leidend is.
2. Corrigeer de README: secretbeheer via options-pagina.
3. Voeg extensieversie toe in `manifest.json`.
4. Stuur bij elk event mee:
   - `extensionVersion`;
   - `traceId`;
   - `eventType`;
   - `sourceHost`;
   - primaire sleutel zoals `rcode`, `systemid`, `lisnr` of e-mail.
5. Toon extensieversie en laatste event in `/systeemcontrole`.
6. Maak schrijftaken begrijpelijker:
   - verlopen cache;
   - record eerst openen;
   - Realworks fout;
   - platform fout;
   - retry mogelijk/niet mogelijk.

Klaar wanneer:

- Een mislukte Realworks-taak uitlegbaar is voor beheer.
- Een event door de hele keten met een trace-id gevolgd kan worden.

## Stap 9: n8n productiebeheer normaliseren

Doel: workflows zijn reproduceerbaar en controleerbaar.

Acties:

1. Exporteer de actieve productie-workflows naar Git na iedere wijziging.
2. Leg per workflow vast:
   - productie actief ja/nee;
   - webhook URL;
   - verwachte secret/header;
   - gebruikte env vars;
   - laatste testdatum.
3. Controleer workflows die `$env` in Code-nodes gebruiken.
4. Maak een checklist voor import:
   - import;
   - credentials koppelen;
   - workflow activeren;
   - n8n herstarten indien nodig;
   - testpayload sturen;
   - export terug naar Git.

Klaar wanneer:

- Een workflowwijziging niet alleen in n8n bestaat, maar ook in Git.
- Bekend is welke workflows productie-kritisch zijn.

## Stap 10: PBX en AI-belassistent productie-afronding

Doel: AI-belassistent kan betrouwbaar en gecontroleerd worden gebruikt.

Acties:

1. PBX VPS upgraden naar minimaal 2 GB RAM, liever 4 GB.
2. Controleer actieve AI-context op hardcoded testdata.
3. Zorg dat de bridge alleen dynamische belkaartcontext gebruikt.
4. Live test uitvoeren met korte greeting.
5. Testcriteria:
   - call start alleen na `BEL`;
   - ontvanger hoort direct audio;
   - klantreacties komen in transcript;
   - AI vat samen;
   - AI vraagt of het klopt;
   - AI hangt zelf op;
   - resultaat komt terug in platform;
   - info-mail wordt verstuurd.
6. Vervang heuristische parser door schema-extractie.
7. Toon laatste callresultaten en bridge health in systeemcontrole.

Klaar wanneer:

- AI-belacties zijn veilig, traceerbaar en reproduceerbaar.
- Mislukte calls krijgen een duidelijke foutstatus.

## Stap 11: OTD en voorstel-flow hard maken

Doel: klantgevoelige verkoopopdracht-flow betrouwbaar afronden.

Acties:

1. Statusmachine expliciet maken:
   - concept;
   - voorstel gemaakt;
   - klant bekeken;
   - klant akkoord;
   - kantoorcontrole;
   - Documenso concept;
   - makelaar getekend;
   - klant uitgenodigd;
   - afgerond.
2. Regressietests toevoegen voor:
   - preview zonder tracking;
   - view tracking;
   - event tracking;
   - akkoordmail;
   - opmerkingenmail;
   - contactupdate;
   - extra opdrachtgever;
   - Documenso concept.
3. Auditlog zichtbaar maken in projectdetail.
4. Ontbrekende gegevens tonen als checklist.

Klaar wanneer:

- De flow is uitlegbaar aan kantoor.
- Elke klantactie heeft een back-upmail of audit event.
- Er is geen directe klantredirect naar Documenso.

## Stap 12: datahygiëne en kantoorbrief

Doel: minder handmatig zoeken, betere dagelijkse prioriteiten.

Acties:

1. Breid datakwaliteit uit:
   - dubbele contacten;
   - ontbrekende telefoons/e-mails;
   - Mautic ID conflicten;
   - agenda zonder contact/project;
   - open quarantaine.
2. Maak herstelacties:
   - samenvoegen;
   - negeren;
   - opnieuw verwerken;
   - taak aanmaken.
3. Bouw een dagelijkse kantoorbrief:
   - warme kansen;
   - open klantopvolging;
   - mislukte automatiseringen;
   - voorstellen die aandacht vragen;
   - Realworks writes die wachten.

Klaar wanneer:

- Het platform vertelt wat vandaag belangrijk is.
- Kantoor hoeft niet in Realworks, Mautic, n8n en WhatsApp tegelijk te zoeken.

## Stap 13: beheerfrequentie

Dagelijks:

- `/systeemcontrole` bekijken.
- Open quarantaine en failed queues beoordelen.
- Belangrijke klantflows controleren.

Wekelijks:

- n8n workflow exports vergelijken met Git.
- Realworks-sync fouten clusteren.
- Backups en deploylogs controleren.
- Open conceptopvolging nalopen.

Maandelijks:

- Productiecontainers en `latest` tags beoordelen.
- Mautic velden/segmenten controleren.
- PBX logs en capaciteit controleren.
- Documentatie bijwerken.
- Lokale werkmappen opnieuw beoordelen.

## Eerstvolgende praktische volgorde

1. GitHub SSH/fetch oplossen voor het platform.
2. Live revision lokaal binnenhalen en vergelijken.
3. Lokale platformwijzigingen groeperen.
4. Productie child theme wijzigingen reviewen.
5. CI uitbreiden met lint/typecheck/test.
6. Buildmetadata in platform tonen.
7. PBX bridge health in systeemcontrole tonen.
8. Realworks-extensieversie en trace-id toevoegen.
9. Eerste contracten maken voor AI caller en Realworks woning/kadaster.
10. n8n export/import checklist uitvoeren voor de kritieke workflows.
