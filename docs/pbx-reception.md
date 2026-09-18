# PBX-opvang en kantoorplatform

## Wat er verandert

De bestaande AI-belassistent blijft uit. De nieuwe opvang gebruikt Asterisk,
vaste Marianne-bandjes, een lokaal duurzame SQLite-wachtrij en het bestaande
kantoorplatform. Er wordt geen Voys-keuzemenu of externe AI-runtime gebruikt.
De installatie wijzigt de publieke inkomende route niet. Intern toestel 8899
loopt direct naar het keuzemenu. De context `devree-reception` bevat daarnaast
de beschikbaarheidsroutering, inclusief de bestaande drie toestellen en 20
seconden rinkelen. De bestaande FreePBX-belgroep en zijn fallback blijven tot
de afzonderlijke omschakeling onaangeraakt.

1. Toets 1 registreert een terugbelverzoek. Bij een verborgen/ongeldig nummer
   vraagt het systeem het nummer en bevestiging. Daarna kan de beller kiezen
   voor een WhatsApp-bevestiging en optioneel maximaal 120 seconden inspreken.
2. Toets 2 legt de aanvraag via de woningpagina of Funda uit en biedt een
   WhatsApp-link naar het woningaanbod aan. Dit boekt zelf geen afspraak.
3. Bij geen/ongeldige keuze wordt het menu eenmaal herhaald, daarna kan de
   beller een bericht inspreken. Zonder keuze en opname is het alleen een
   gemiste oproep. Zonder nummer ontstaat bij een bericht een uitzoektaak.
4. Geen WhatsApp-keuze betekent geen toestemming. Ook zonder WhatsApp blijft
   een terugbelverzoek bestaan. Een netwerkstoring verandert dit niet.

Het platform toont dit onder Telefonie → PBX-opvang. Taken gebruiken de
bestaande takenlijst, medewerker en statussen: open, in behandeling, wacht op
klant, afgerond. Herhaalde oproepen van hetzelfde nummer groeperen bij de
openstaande taak. Een medewerker kan een oproep als apart onderwerp splitsen.
Contacten worden alleen gekoppeld bij een unieke telefoonmatch; handmatig
koppelen aan een bestaand Mautic-ID blijft mogelijk. De contacthistorie toont
gekoppelde oproepen en notities. De WhatsApp-conversatie is direct bereikbaar.

## Beschikbaarheid

Standaard: ma–vr 09:00–17:30, za 10:00–13:00, zo gesloten, Europe/Amsterdam.
Sluitingsdagen zijn instelbaar. Buiten de deur heeft altijd een eindtijd.
De PBX haalt de configuratie iedere tien seconden op en past de vervaldatum
ook zonder verbinding zelf toe. De laatst bekende configuratie blijft geldig.
Een terugbeltaak krijgt als deadline het einde van de huidige of volgende
openingsdag. De beller krijgt geen harde reactietijd toegezegd.

## Betrouwbaarheid en berichten

AGI schrijft eerst lokaal, met SQLite FULL synchronous. Pas daarna klinkt de
ontvangstbevestiging. Record(k) behoudt de opname als de beller ophangt.
De syncdienst verzendt gebeurtenissen met een uniek gesprek-ID en revisie;
het platform schrijft verzoek, taak en outbox in één serialiseerbare transactie.
Herhaalde/vertraagde webhooks maken geen dubbele taak of bevestiging.
De opname wordt apart met SHA-256 gecontroleerd overgedragen. Bestanden zijn
niet publiek bereikbaar; afspelen vereist een ingelogde platformsessie.

WhatsApp staat standaard uit (`PBX_SEND_MODE=off`). `test` verzendt uitsluitend
naar `PBX_TEST_NUMBERS`; `live` is onderdeel van de latere vrijgave. Er is één
terugbelbevestiging per taak, en hooguit één woninglink per nummer per 24 uur.
De lokale platformtimer verwerkt de outbox elke 30 seconden. Sessiestoringen
laten berichten wachten. Een onzekere verzenduitkomst wordt niet automatisch
opnieuw verstuurd: eerst de conversatie controleren. Provideracceptatie,
afleveren en lezen zijn afzonderlijke statussen. Vroege en vertraagde ACKs
worden duurzaam bewaard en kunnen een leesstatus niet terugzetten.

Het systeem toont de echte PBX-terugmelding: configuratieversie, audio,
opslag, Asterisk en wachtrij. De uitgeschakelde AI-bridge wordt niet als storing
gepresenteerd. De melding vermeldt expliciet of alleen de testroute actief is.

## Opnames en bewaartermijn

Opnames blijven beschikbaar zolang de taak open is. Dertig dagen na afronden
worden ze uit het platform verwijderd. De PBX ontvangt dezelfde verwijderlijst
en verwijdert zijn exemplaar bij de eerstvolgende verbinding. Bij een offline
PBX kan de lokale verwijdering dus later plaatsvinden. Bij opnieuw openen na
verwijdering komt de opname niet terug. Taak, contactkoppeling en geschiedenis
blijven bestaan. Neem opnames niet onbeperkt op in externe back-ups: pas daarop
dezelfde bewaartermijn toe. De installatieback-up bevat geen nieuwe opnames.

## Installatie

- Additieve Prisma-migratie, vooraf database- en configuratieback-up.
- Platformsecret `PBX_SERVICE_SECRET` minimaal 32 tekens; afzonderlijk van
  bestaande webhooktokens. Alleen in afgeschermde serverconfiguratie bewaren.
- Volume `./uploads/pbx:/app/uploads/pbx`, uid/gid 1001, mode 0700.
- PBX-bestanden in `/opt/devree-reception`; staat in `/var/lib/devree-reception`.
- `/etc/devree-reception.env`: PBX_PLATFORM_URL (HTTPS), PBX_SERVICE_SECRET,
  PBX_ROUTE_MODE=test. Root schrijft, alleen asterisk mag lezen (0640).
- `devree-reception.service` gebruikt de asterisk-gebruiker en een beperkt
  beschrijfbaar pad. Geen nieuwe luisterpoort of publiek beheerendpoint.
- Platform: `devree-pbx-outbox.timer` + service, helper in `/usr/local/sbin`.
- Alle WAV-bestanden uit `pbx/reception/audio` naar de Asterisk-soundmap.

## Testen en vrijgave

Geautomatiseerd: `npm run verify`; `python3 -m unittest discover -s pbx/reception -v`.
`scripts/pbx/run-integration.py` maakt een lege, tijdelijke MySQL-database,
controleert transacties, gelijktijdigheid, deduplicatie, toestemmingen,
opnameoverdracht, retentie en vroege/vertraagde ACKs, en ruimt die testdatabase op.

Praktijktest op de aparte route: beide keuzes, geen keuze, verkeerde toets,
verborgen nummer met bevestiging, geen WhatsApp, ophangen tijdens toestemming,
ophangen tijdens opname, twee gelijktijdige bellers en herhaald bellen.
Controleer hoorbaarheid, uitspraak, toetsherkenning, taak, afspeelbare opname,
WhatsApp op het opgegeven testtoestel, antwoord in de inbox en contacthistorie.
Een providerstatus SENT geldt niet als bewijs van ontvangst op het toestel.
Test ook netwerkuitval/herstel en afwezigheid met korte vervaltijd.

Pas na die praktijktest en aparte vrijgave: huidige Voys-routering vastleggen,
de inkomende PBX-bestemming naar `devree-reception,s,1` zetten en zo nodig de
Voys-doorverbinding naar de PBX activeren. Vervolgens nogmaals via het echte
hoofdnummer bellen. De teststatus en WhatsApp-modus worden afzonderlijk
omgezet; een groene heartbeat schakelt nooit automatisch de hoofdroute om.

Rollback: inkomende bestemming herstellen uit de vooraf vastgelegde route;
WhatsApp terug naar off; nieuwe timer/service stoppen. Bewaar wachtrij en
opnames zodat reeds ontvangen verzoeken kunnen worden afgehandeld. Bij een
platformrollback blijven de additieve tabellen staan; geen destructieve
database-rollback. De oude AI-diensten blijven uit.
