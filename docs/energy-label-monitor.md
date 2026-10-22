# Energielabelmonitor

`/kansen/vroege-signalen` toont EP-Online registraties, geen aanvragen of verkoopplannen.
Gebied: Nissewaard, Voorne aan Zee, Rozenburg, Pernis en Hoogvliet. PC4 is uitsluitend
voorselectie; plaats/gemeente en het exacte adres worden gecontroleerd met BAG via PDOK.
Onzekere adressen en detailaanduidingen blijven ter controle en tellen niet mee in metingen.

## Invoer en authenticatie

De host-worker `scripts/energy-label-monitor.py` gebruikt alleen Python 3 standaardmodules.
De bestaande n8n credential **Energielabels header auth** wordt eenmalig server-side
uitgelezen, nooit naar Git of logs geëxporteerd. Configuratie (0600, platformgebruiker):
`/home/DeVreeMakelaardij/.config/energy-label-monitor.json` met `apiKey`, `platformUrl`
(loopback poort 3100) en de bestaande `webhookSecret`. De key hoeft niet in de webcontainer.

EP-Online API v5 levert momenteel v4 CSV/XML-bestanden. De worker laadt maandelijks de
CSV-totaalstand en daarna XML-dagmutaties in landelijke volgnummer-volgorde (1 toevoegen,
2 verwijderen). Nationale bestanden worden gestreamd; alleen regionale woningen komen
in de lokale SQLite-status. Ontbrekende dagen worden niet overgeslagen. Een maandelijkse
herstart na een achterstand markeert de historie als onvolledig. Nieuwe snapshotvondsten
zijn baseline. Een 404 voor een nog niet beschikbaar dagbestand schuift het checkpoint
niet op. Systeemcontrole waarschuwt bij meer dan 48 uur zonder import of 72 uur bronachterstand.

SQLite, cache en transactionele outbox: `~/.local/share/energy-label-monitor/`.
De eerste volledige import, inclusief de resterende dagbestanden, is startvoorraad.
Een labelcorrectie met dezelfde objectidentiteit en opnamedatum behoudt de oorspronkelijke
ontdekkingsdatum. Nieuwe opname: nieuw signaal met het vorige lokaal bekende label.
Verwijderingen en vervangingen blijven in de signaalhistorie zichtbaar. Geen actieve
marktobjecten, contactrecords, acquisitieberichten of zoekermatches worden aangemaakt.

`POST /api/energy-labels/ingest` accepteert uitsluitend de serversecret en batches van
maximaal 100 signalen. Upsert op `sourceKey` maakt herhalen veilig. Ontdekkingsdatum en
baseline zijn onveranderlijk. `GET /api/energy-labels` en de gezondheidsroute vereisen
bestaande platformauthenticatie. De worker meldt geen secrets, downloadlinks of responsebodies.

## Verkoopmeting

Koppeling via exact postcode/huisnummer/toevoeging; conflicterende objectidentiteiten
worden uitgesloten. Alleen expliciete koopindicaties in nieuwe Realworks-mutaties tellen
als verkoopaanbod. Ontdekking wordt vergeleken met ontvangst van het aanbod, met controle
op een oudere brondatum. Baseline, al bekend aanbod, nieuwbouw en onzekere adressen vallen
buiten de 30/60/90-dagenmeting. Alleen volgroeide cohorten tellen mee. Geen waarneming
bewijst niet dat er geen verkoop was. Signalen en uitkomsten blijven 366 dagen bewaard,
onafhankelijk van opruiming van marktobjecten. De huidige labelstand blijft als basis behouden.

## Uitrol en herstel

1. Back-up van platformdatabase en compose; reguliere Prisma-migratie bij image-start.
2. Deploy image via bestaande GitHub Actions-flow. Kopieer de worker naar `~/.local/bin/`.
3. Installeer service/timer uit `scripts/systemd/`; timer 07.00 Europe/Amsterdam.
4. Start service eenmalig, controleer readback van API en twintig adressen tegen bron/BAG.
5. Controleer `systemctl status devree-energy-label-monitor.timer` en
   `journalctl -u devree-energy-label-monitor.service`. De lock voorkomt dubbele runs.
6. Bij problemen: stop de timer, behoud SQLite/outbox en zet de vorige applicatie-image
   terug. De schemawijziging is uitsluitend additief. Geen bestaande tabellen verwijderen.

Tests: `npm run verify`, `npm run build`,
`python3 -m unittest discover -s scripts -p 'test_energy_label_monitor.py'`.
Bronnen: https://public.ep-online.nl/swagger/index.html,
https://www.ep-online.nl/PublicData, https://www.pdok.nl/pdok-locatieserver.
