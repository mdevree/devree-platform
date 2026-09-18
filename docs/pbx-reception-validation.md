# PBX-opvang: validatie 18 september 2026

## Geïnstalleerd

- Platformimage `ghcr.io/mdevree/devree-platform:d0eb7cb`; beide GitHub-builds en deployments geslaagd.
- Additieve database-migratie, private opnameopslag en outbox-timer actief.
- PBX-service actief; interne testroute **8899**; alle 13 Marianne-bandjes geïnstalleerd als PCM 16-bit, mono, 8 kHz.
- AGI-bron en geïnstalleerd bestand hebben dezelfde SHA-256: `7579c0334f9f6eddd96ded8b3ba93698d5fa5fbb765341b3b11323d19f8b089d`.
- AI-belassistent uit. Openbare inkomende bestemming blijft `ivr-1,s,1`.
- Tijdelijke automatische beltestdriver na de tests uit het dialplan verwijderd.
- Na expliciete toestemming is de bestaande kantoor-WhatsApp-sessie gekoppeld aan `https://kantoor.devreemakelaardij.nl/api/webhooks/whatsapp`, voor `message.any` en `message.ack`. Configuratie teruggelezen; sessie `WORKING`; HTTPS-webhook geeft 200 op een onschuldig statusbericht.
- Automatische PBX-WhatsApp-verzending blijft **off**. Er zijn geen testberichten aan echte telefoonnummers verzonden.

## Uitgevoerde controles

- `npm run verify`: 177 geslaagd, 0 mislukt, 1 bestaande skip; lint en typecheck geslaagd.
- Productiebuild lokaal en in CI geslaagd.
- Python-suite: 20 geslaagde tests, inclusief ophangen tijdens het keuzemenu en opname; sommige queue-tests worden via overerving herhaald.
- Integratietest in tijdelijke lege MySQL-database: transacties, gelijktijdige deduplicatie, groepering, revisies, toestemming, limiet op bezichtigingslinks, opname-integriteit, retentie en vroege/vertraagde afleverbevestigingen geslaagd. Testdatabase opgeruimd.
- Twee echte interne Asterisk-terugbeloproepen met testtoon en fictief nummer `+99900000000`: duurzaam opgeslagen, doorgegeven en opgenomen in één taak voor Melvin. Beide WAV-bestanden overgedragen. Geen WhatsApp-toestemming of outboxbericht.
- Een tijdelijk onbereikbaar platform tijdens deployment hield de lokale wachtrij intact; verwerking hervatte automatisch.
- Interne bezichtigings- en gemiste-oproeptests: correct geregistreerd zonder onterechte terugbeltaak. Geen keuze zonder audio levert alleen een gemiste oproep op.
- Ophangen stopte aanvankelijk niet alle AGI-opdrachten. Dit is hersteld met een hangup-vlag en READSTATUS-controle; daaropvolgende interne oproepen en tests geslaagd.
- Platform-UI: twee oproepen samen zichtbaar, notitie opgeslagen en teruggelezen, status gewijzigd en testtaak afgerond. Na herladen zichtbaar onder Afgerond. PBX verbonden, wachtrij leeg.
- Niet-ingelogde toegang tot configuratie, verzoeken en opname geeft 401.

## Nog nodig vóór vrijgave hoofdnummer

1. Een door Melvin opgegeven testnummer tijdelijk toelaten in WhatsApp-testmodus. Terugbelbevestiging en bezichtigingslink ontvangen op het toestel; antwoord en aflever-/leesstatus in het platform controleren. Provideracceptatie alleen is onvoldoende.
2. Via een echte telefoon de interne route beluisteren: uitspraak, volume, toetsherkenning, verborgen nummer, herhaling en opname. Audiobestanden zijn technisch gecontroleerd, niet auditief goedgekeurd.
3. Beschikbaarheid via de UI opslaan en verstrijken controleren. De vervallogica is automatisch getest; de datum/tijd-invoer kon in de browserautomatisering niet worden ingevuld en is nog niet praktisch afgetekend.
4. Na aparte vrijgave de hoofdroute omschakelen en vervolgens het openbare nummer doorbellen. Tot die tijd blijft de bestaande route actief.

## Herstelpunten

- Platformdatabase en configuratie: `/home/DeVreeMakelaardij/backups/pbx-reception-20260918T055745Z` op de platformserver.
- PBX-configuratie: `/root/backups/pbx-reception-20260918T060532Z` op de PBX.
- WhatsApp-sessieconfiguratie vóór koppeling: `/home/DeVreeMakelaardij/backups/pbx-waha-20260918T062514Z` op de platformserver (afgeschermd; bevat configuratiegegevens).
- Zie `docs/pbx-reception.md` voor bediening, installatie, retentie en rollback.
