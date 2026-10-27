# Marketingblok op dashboard

De collector leest uitsluitend `GET /integrations` en `GET /analytics/:id?date=N`
van de bestaande Postiz Public API. Een systemd timer haalt viermaal per dag
metingen op. De website leest alleen opgeslagen gegevens; een paginabezoek
doet geen verzoeken aan sociale platforms.

## Installatie

1. Maak een gecontroleerde databaseback-up. Deploy de platformcode; de bestaande
   entrypoint voert de additieve Prisma-migratie uit.
2. Plaats `marketing-sync.py` in de bestaande `.local/bin` van de applicatiegebruiker.
3. Maak `/home/DeVreeMakelaardij/.config/marketing-sync.json`, eigenaar
   `DeVreeMakelaardij`, modus 0600, met `postizUrl` (eindigend op
   `/api/public/v1`), `postizApiKey`, `platformUrl` (`http://127.0.0.1:3100`)
   en `webhookSecret` (de bestaande platformwaarde). Nooit in Git of logs.
4. Installeer de twee systemd-bestanden. Start eerst de oneshot en controleer
   `/api/marketing/overview?days=7` en `?days=30`; activeer daarna de timer.

De JSON-respons van de collector bevat alleen aantallen en kanaalstatussen.
De import is idempotent op kanaal, venster en meetmoment. Een fout wist geen
laatste goede meting. De frontend markeert oudere of mislukte bronmetingen.
De snapshots blijven bewaard zodat wijzigingen van vensters later controleerbaar zijn.

## Meetregels

- Facebook: `Media views`, einddatumlabel één dag terug (Meta end_time);
  vandaag uitgesloten. Geen optelsom van uniek bereik of vaste Postiz +5%.
- Google: `Website Clicks`; drie recente dagen uitgesloten wegens vertraging.
- Pinterest: `Impressions`; laatste beschikbare volledige dag.
- LinkedIn-bedrijf: `Page Views`; geen punt betekent onbekend, niet nul.
- YouTube: `Estimated Minutes Watched`; twee recente dagen uitgesloten.
- Dagreeksen: 65 brondagen ophalen, twee aansluitende vensters van 7/30 dagen.
  Elk venster moet compleet zijn; ontbrekende dagen worden niet aangevuld.
- Instagram: Postiz levert `Views` alleen als periodetotaal. Vensters van 7/30
  dagen apart bewaren. Vergelijk pas met een opgeslagen overeenkomstig venster
  7/30 dagen eerder (maximaal 90 minuten afwijking om DST toe te staan).
  Dit zijn bronperioden, geen gereconstrueerde Amsterdamse kalenderdagen.
- TikTok: actuele `Followers`, vergelijken met opgeslagen stand. Niet de
  cumulatieve views van een wisselende set van twintig video's vergelijken.
- Nul als vorige waarde: alleen absolute groei tonen; geen oneindig percentage.
- Dagdata kan met terugwerkende kracht veranderen; iedere import haalt opnieuw
  de hele vergelijkbare periode op. `percentageChange` wordt nooit opgeslagen.

## Controle en herstel

`npm run verify`, `npm run build`, `python3 -m py_compile scripts/marketing-sync.py`.
Controleer importauth (401), afwijzen ongeldige gegevens (400), dubbele import,
periodewisseling en browserweergave. Geen echte API-sleutels in testfixtures.
Bij terugrollen timer stoppen en vorige platformimage gebruiken. De nieuwe
tabel kan blijven staan; er zijn geen bestaande tabellen of gegevens gewijzigd.
