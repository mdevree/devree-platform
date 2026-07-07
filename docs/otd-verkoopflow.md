# OTD en offerteflow verkoopprojecten

## Doel

De opdracht tot dienstverlening wordt geen losse AI-chat meer, maar een gecontroleerde projectflow in het platform. Realworks levert de object-, verkoper-, prijs-, courtage- en kadasterdata aan. Het platform maakt vroeg een verkoopproject aan, zodat dezelfde gegevens later bruikbaar zijn voor offerte, opdracht tot dienstverlening, ondertekening en opvolging.

## Startmomenten

### 1. Vroeg verkoopproject

Bij iedere betrouwbare `broker.brokerobject/save` uit Realworks met minimaal een objectcode, objectadres of Realworks `_systemid` wordt een verkoopproject aangemaakt of bijgewerkt.

Te vullen velden:

- Realworks object `_systemid`
- objectcode / `lisnr`
- adres, postcode, plaats
- vraagprijs en conditie
- courtagepercentage
- energielabel einddatum
- opdrachtgever-relatiecode (`lisrcode`)
- opdrachtgevernaam (`lisrcode_result`)

Deze fase is bedoeld voor offerte/opvolging. Het project staat standaard op `LEAD`.

### 2. Offertefase

Vanuit het project komt later een knop `Offerte voorbereiden`.

De offerte gebruikt:

- opdrachtgever(s) uit Mautic/ProjectContact
- objectdata uit Realworks
- courtage uit Realworks of handmatig aangepast
- vaste kantoorinformatie

Versturen gebeurt niet stil automatisch. Het platform kan een Mautic-contact koppelen en een concept/offerte klaarzetten, waarna kantoor akkoord geeft.

### 3. OTD-fase

Wanneer Realworks `lisstate = 13` (`In aanmelding`) meestuurt, markeert de intake-response `otdReadyTrigger = true`.

Dat betekent:

- project bestaat al of wordt aangemaakt
- OTD-controlepagina kan alle bekende data tonen
- ontbrekende gegevens worden gemarkeerd
- PDF kan na controle worden gegenereerd

## Mautic-koppeling

De intake zoekt bij `lisrcode` in Mautic op `realworks_code`.

Als exact gevonden:

- contact wordt gekoppeld als `ProjectContact`
- rol wordt `opdrachtgever`
- label wordt Realworks naam

Niet gevonden betekent geen blokkade. Het project blijft bestaan en de controlepagina toont dat de opdrachtgever nog niet gekoppeld is.

## Meerdere opdrachtgevers

Het OTD-model gebruikt altijd een lijst:

```ts
opdrachtgevers: OtdOpdrachtgever[]
```

Daarmee ondersteunt de PDF:

- 1 opdrachtgever: compact blok
- 2 opdrachtgevers: twee blokken/tabelregels
- 3+ opdrachtgevers: compacte tabel over meerdere pagina's
- ondertekening: één tekenblok per opdrachtgever plus het vaste NVM-lid blok

## Kadasterdata

De gewone `broker.brokerobject/save` bevat meestal alleen `kadaster_grid__FIELD_INACTIVE__`, niet de feitelijke kadastrale aanduiding.

De feitelijke kadasterdata komt via:

```txt
POST /servlets/objects/broker.brokerobject/grid
_entity=broker.kadaster
_collection=invoke:getKadasterForGrid
_systemid=<Realworks object id>
```

De extensie leest de grid-response en stuurt naar:

```txt
POST /api/otd/intake/realworks/kadaster
```

Koppeling gebeurt op `_systemid`, dus bijvoorbeeld `10409219`. Het platform vult alleen kadastervelden als er een project met dat Realworks object bestaat.

## Controlepagina

Projectdetail krijgt uiteindelijk een sectie `Opdracht tot dienstverlening` met:

- opdrachtgever(s), bewerkbaar
- object, bewerkbaar
- kadastraal, bewerkbaar
- vraagprijs, courtage, aanvaarding, verkoopmethode
- kosten: publiciteit, energielabel, intrekking, bedenktijd
- bijzondere afspraken
- ontbrekende gegevens / waarschuwingen
- knop `PDF genereren`

## PDF-stijl

De PDF volgt de factuurstijl:

- logo gecentreerd bovenaan
- geen zware bovenbalk
- De Vree groen als accentkleur
- footer met adres, telefoon, e-mail, website, IBAN, KvK, BTW
- paginanummering `Pagina 1/3`
- ruime tekenblokken

## Veiligheidsregels

- Realworks-data mag projecten aanmaken of aanvullen, maar niet automatisch documenten versturen.
- Bestaande projectstatussen worden niet teruggezet door een Realworks-save.
- Ontbrekende of onzekere velden blijven controlepunten.
- Kadasterdata wordt alleen gekoppeld met object `_systemid`.
- Mautic-koppeling gebeurt alleen via exacte `realworks_code`.
