# PBX-opvang: validatie 18 september 2026

## Korter menu zonder extra WhatsApp-vraag

Op verzoek van Melvin worden bij keuze 1 en 2 de bijbehorende WhatsApp-berichten
automatisch klaargezet. De aparte toestemmingsbandjes en de extra toetskeuze
zijn uit beide routes verwijderd. Bij keuze 2 vervalt ook het losse opgeslagen-
bandje. Nummerinvoer/bevestiging blijft bij een ontbrekend of ongeldig nummer.
Zonder bruikbaar nummer volgt geen WhatsApp. De wachtrij wordt opgeslagen
voordat de ontvangstbevestiging of bezichtigingsinformatie wordt afgespeeld.

21 Python-tests geslaagd, waaronder automatische berichten na één menukeuze,
geen bericht bij onbekend nummer en behoud van de opname bij ophangen.
Geïnstalleerde AGI en lokale bron hebben SHA-256
`0dde45381e9a63cb2142c56bff02f28930e9f74b0ca3b3483646c080ed7a01a0`.
Service actief; 8899 verwijst naar het menu. Back-up:
`/root/backups/pbx-short-menu-20260918T104708Z`.
Testmodus blijft uitsluitend voor Melvins nummer; geen extra testbericht
verstuurd tijdens deze wijziging. Openbare hoofdroute niet aangepast.

## Zoiper-vervolgtest en huidige teststand

De echte Zoiper-bezichtigingsoproep van 09:00 kwam correct binnen, inclusief
telefoonnummer en toestemming. Er kwam geen nieuwe link door de eerdere
24-uurslimiet en de inmiddels uitgezette verzending. Correctie `6e3df39` laat
nieuwe oproepen van expliciet toegestane testnummers de link herhaald aanvragen;
idempotentie per oproep en de limiet voor overige nummers blijven behouden.
Volledige verify en geïsoleerde database-regressietest geslaagd; CI-deploy
geslaagd en productieimage gecontroleerd. Het oorspronkelijke verzoek opnieuw
verwerkt met dezelfde toestemming: één link verzonden, echte status DELIVERED.

Huidige stand: **testmodus aan, uitsluitend Melvins opgegeven mobiele nummer**,
zodat verdere Zoiper-tests werken. Dit vervangt de eerdere vermelding dat
verzending na de eerste praktijktest uit stond. Het hoofdnummer blijft ongewijzigd.
Configuratieback-up: `/home/DeVreeMakelaardij/backups/pbx-zoiper-test-20260918T070404Z`.

## Aanvullende WhatsApp-praktijktest

- Melvin gaf expliciet zijn mobiele nummer op voor twee testberichten. Tijdelijk testmodus met alleen dat nummer toegestaan; vooraf geen oudere wachtende berichten naar dat nummer.
- Terugbelbevestiging en bezichtigingslink via de echte PBX-outbox verstuurd. Beide ontvangen echte WAHA-ACK 2 (afgeleverd). Melvins reactie “Test ontvangen.” is in dezelfde bestaande kantoorconversatie opgeslagen.
- De praktijktest toonde een verschil tussen kale bericht-ID's in verzendresponses en samengestelde WAHA-ID's met een LID-prefix in webhooks. Normalisatie toegevoegd voor verzenden, ontvangen en afleverbevestigingen; bestaande opgeslagen samengestelde ID's blijven ondersteund.
- Regressietests voor ID-normalisatie, afleveren en lezen geslaagd; volledige verify: 178 geslaagd, 0 mislukt, 1 bestaande skip. Geïsoleerde database-integratietest opnieuw geslaagd.
- Correctie `689fa50` via CI uitgerold en live image gecontroleerd. De al ontvangen ACKs opnieuw verwerkt, zonder berichten opnieuw te verzenden: beide berichten staan nu op **DELIVERED**. Geen leesbevestiging ontvangen; een reactie bewijst niet dat de provider een READ-event heeft geleverd.
- Testtaak afgerond; configuratie- en taakback-up in `/home/DeVreeMakelaardij/backups/pbx-whatsapp-test-20260918T063829Z`. Automatische verzending terug op **off**, whitelist leeg, outbox leeg. Openbare route niet gewijzigd.
- De WhatsApp-praktijktest hieronder is hiermee afgerond voor verzending, aflevering en antwoorden. Telefonisch beluisteren en beschikbaarheid blijven vóór vrijgave nodig.

Operationeel aandachtspunt: de WAHA-container schreef interne sessiesleutelgegevens naar zijn log. Deze waarden zijn niet opgenomen in dit verslag of Git. Advies: dergelijke logging uitschakelen, bestaande logs gecontroleerd opruimen en de sessiesleutels vernieuwen door opnieuw te koppelen op een geschikt moment.

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
