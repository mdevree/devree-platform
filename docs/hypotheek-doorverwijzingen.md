# Hypotheekdoorverwijzingen

Samenwerkingen gebruikt `HypotheekDoorverwijzing` als bron voor aantallen. Deelnames zijn uniek per adviseur en lead. Een gezin telt eenmaal; de eerste betrokkene is hoofdcontact. Nieuwe personen krijgen CONTACT, bestaande leadstatussen blijven behouden.

## Opslag en compatibiliteit

Registreren/corrigeren loopt via `src/lib/hypotheek/service.ts`. De instellingenrij is de transactionele registratiesluis: contacthergebruik, deelnemers, verwijzing en legacy-samenvattingen worden onder dezelfde lock opgeslagen. Alle oude hypotheekroutes gebruiken dezelfde service. Een mislukking draait de transactie terug. Een herhaalde verwijzing bewaart de eerste datum. Leadverwijdering is geblokkeerd bij deelname, ook via de foreign key.

De migratie is aanvullend. Iedere bestaande adviseurskoppeling wordt één `legacy_<leadId>` verwijzing; routehistorie is context, geen extra telling. Onbekende datums blijven null. De datum is een SQL DATE, los van registratie-timestamps; periodeselecties gebruiken Europe/Amsterdam.

## Mailverwerking

De bestaande IMAP-workflow krijgt één extra HTTP-tak, met bestaande httpHeaderAuth-credential en continueRegularOutput bij fouten. Het bronbericht wordt niet via een tweede mailboxlezer opgehaald. De API bewaart alleen identificatie en een korte passage, geen volledige mail of bijlagen.

Automatische registratie staat na migratie uit. In Samenwerkingen kan deze aan/uit; inschakelen stelt de starttijd op nu. Oude berichten en `historical: true` komen ter controle. `dryRun: true` analyseert zonder te schrijven. Message-ID en mailbox vormen de unieke eventidentificatie. Nieuwe mails over dezelfde verwijzing worden gekoppeld zonder datumwijziging. Alleen exacte adressen/telefoons tellen als contactbewijs; families en conflicten gaan naar controle.

API:
- POST `/api/hypotheek-doorverwijzingen`: adviseurId, contacten[], datum (YYYY-MM-DD/null), notities.
- GET/PATCH `/api/hypotheek-doorverwijzingen/[id]`: bekijken/corrigeren, inclusief deelnemers en hypotheekAfgesloten.
- GET `/api/hypotheekadviseurs/[id]/doorverwijzingen`: periode, search, page; 25 per pagina.
- POST `/api/hypotheek-doorverwijzingen/mail-events`: messageId, mailbox, sentAt, from, to, cc, subject, textPlain/textHtml, dryRun/historical.
- GET mail-events: controlelijst. PATCH mail-events/[id]: action register/ignore; registratievelden als boven.
- GET/PATCH instellingen: automatisch en afzenders. GET/PUT hypotheekadviseurs/[id]/emailadressen: extra partneradressen.

## Controle en uitrol

1. Maak een private dump van de platformdatabase; verifieer de dump. Bewaar de actuele mailworkflow als herstelkopie.
2. Laat de normale release `prisma migrate deploy` uitvoeren. Vergelijk aantallen met bestaande leadkoppelingen en controleer de vier aangevulde verwijzingen op naam en datum.
3. Patch alleen de extra node/tak uit `n8n/hypotheek-doorverwijzing-node.json` op de live export van Workflow 1: Email Filter; vervang niet blind de volledige workflow door de repositorykopie. Gebruik ondersteund n8n-beheer om deze te publiceren.
4. Beproef historische mails met dryRun. Gebruik de mailworkflow niet als testverzender. Schakel automatisch koppelen pas na de controles in.
5. Controleer UI, API, workflowpublicatie en de eerste uitvoering. Bij een storing eerst automatisch koppelen uit; de handmatige functie blijft werken. Rollback van de app vereist behoud van de aanvullende tabellen en een terugkeer naar uitgeschakelde mailverwerking.

Tests: `npm run verify`, `npm run build`. De optionele database-integratietest vereist `HYPOTHEEK_INTEGRATION=1` en een uitsluitend voor die test ingerichte DATABASE_URL, met de vier synthetische migratiefixtures. De normale suite slaat die test over. De integratietest controleert migratie, gelijktijdigheid, rollback, duplicaten, gezinnen, historische/lege datums, verwijderbescherming, paginering en mailafhandeling.
