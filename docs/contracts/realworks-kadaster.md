# Contract: Realworks kadaster sync

Laatst bijgewerkt: 2026-07-12.

Dit contract beschrijft kadastrale gegevens uit Realworks naar het platform.

## Richting

Realworks browserextensie leest de kadaster-grid response uit Realworks en post
die naar:

```http
POST /api/otd/intake/realworks/kadaster
```

## Authenticatie

```http
x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

## Realworks bron

De gewone woning-save bevat meestal alleen een inactive grid marker. De feitelijke
kadasterdata komt uit:

```text
POST /servlets/objects/broker.brokerobject/grid
_entity=broker.kadaster
_collection=invoke:getKadasterForGrid
_systemid=<Realworks object id>
```

## Koppeling

Het platform koppelt kadasterdata primair op Realworks object `_systemid`.

| Veld | Gebruik |
| --- | --- |
| `realworksSystemId` | Realworks `_systemid`; leidend voor koppeling |
| `objectCode` | Fallback objectcode/lisnr als beschikbaar |
| `rows` | Gestructureerde kadasterregels |
| `rawText` | Fallback tekst als parsing nodig is |

## Payload

```json
{
  "source": "realworks_browserext",
  "eventType": "kadaster.grid",
  "traceId": "kadaster_grid_...",
  "payloadVersion": "2026-07-07",
  "extensionVersion": "1.9",
  "capturedAt": "2026-07-12T12:00:00.000Z",
  "sourceUrl": "https://crm.realworks.nl/...",
  "realworksSystemId": "10409219",
  "objectCode": "SE11798",
  "rows": [
    {
      "gemeente": "Breda",
      "sectie": "A",
      "nummer": "1234",
      "grootte": "1 are 23 centiare"
    }
  ],
  "rawText": "Gemeente Breda sectie A nummer 1234 grootte 1 are 23 centiare"
}
```

## Verplichte velden

| Veld | Verplicht | Opmerking |
| --- | --- | --- |
| `realworksSystemId` | Ja | Alleen hiermee mag automatisch aan project gekoppeld worden |
| `source` | Ja | `realworks_browserext` |
| `eventType` | Ja | `kadaster.grid` |
| `rows` of `rawText` | Ja | Minimaal een bron voor parsing |
| `traceId` | Gewenst | Nodig voor ketentracing |
| `extensionVersion` | Gewenst | Nodig voor systeemcontrole |

## Platformgedrag

- Zoek project op `realworksSystemId`.
- Vul alleen kadastervelden als een bijpassend project bestaat.
- Gebruik `rows` als primaire bron.
- Gebruik `rawText` als fallback voor parsing.
- Geen projectmatch betekent geen automatische mutatie.

## Foutgedrag

- Geen `realworksSystemId`: HTTP 400 of quarantaine.
- Geen rows/rawText: HTTP 400 of genegeerd event.
- Meerdere of onzekere kadasterregels: markeren als controlepunt.
- Bestaande handmatige projectcorrecties mogen niet stil overschreven worden
  zonder duidelijke bronprioriteit.
