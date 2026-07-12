# Contract: Realworks woning sync

Laatst bijgewerkt: 2026-07-12.

Dit contract beschrijft woning/object data uit Realworks naar n8n en platform.

## Richting

Realworks browserextensie onderschept:

```text
POST /servlets/objects/broker.brokerobject/save
```

Daaruit ontstaan twee mogelijke payloads:

1. Realworks -> n8n `realworks-woning-sync`.
2. Realworks -> platform `/api/otd/intake/realworks` voor verkoopproject/OTD.

## Authenticatie

Voor directe platformcalls:

```http
x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

Voor n8n webhooks loopt authenticatie via de n8n endpointconfiguratie.

## Identificatie

| Sleutel | Gebruik |
| --- | --- |
| `_systemid` | Realworks interne object-ID; leidend voor kadasterkoppeling en schrijftaken |
| `objectcode` | Objectcode/lisnr, bijvoorbeeld `SE11798` |
| `lisnr` | Alternatieve objectcode |

Het platform mag Realworks-data gebruiken om een project aan te maken of aan te
vullen, maar mag geen klantdocumenten automatisch versturen.

## Payload naar n8n

```json
{
  "source": "realworks",
  "traceId": "woning_save_...",
  "payloadVersion": "2026-07-07",
  "extensionVersion": "1.9",
  "capturedAt": "2026-07-12T12:00:00.000Z",
  "_systemid": "9042120",
  "objectcode": "SE11798",
  "lisnr": "SE11798",
  "lisstreet": "Groede",
  "liststrnr": "62",
  "liszipcode": "1234 AB",
  "liscity": "Breda",
  "lissalepr": "400.000,00",
  "lisstate": "13",
  "lisstate_label": "In aanmelding",
  "energieklasse": "4",
  "energieklasse_label": "B"
}
```

## Payload naar platform intake

```json
{
  "source": "realworks_browserext",
  "eventType": "otd.ready",
  "traceId": "woning_save_...",
  "payloadVersion": "2026-07-07",
  "extensionVersion": "1.9",
  "capturedAt": "2026-07-12T12:00:00.000Z",
  "realworksPath": "/servlets/objects/broker.brokerobject/save",
  "sourceUrl": "https://crm.realworks.nl/servlets/objects/broker.brokerobject/save",
  "data": {
    "_systemid": "9042120",
    "objectcode": "SE11798",
    "lisstate": "13"
  }
}
```

`eventType` is:

- `otd.ready` als `lisstate === "13"`;
- `verkoop.project.sync` voor gewone verkoopproject-aanvulling.

## Verplichte velden

| Veld | Verplicht | Opmerking |
| --- | --- | --- |
| `_systemid` of `objectcode` of `lisnr` | Ja | Minimaal een betrouwbare objectsleutel |
| `source` | Ja | `realworks` of `realworks_browserext` |
| `eventType` | Ja voor platform intake | `otd.ready` of `verkoop.project.sync` |
| `traceId` | Gewenst | Nodig voor ketentracing |
| `extensionVersion` | Gewenst | Nodig voor systeemcontrole |

## Filtering door extensie

De extensie filtert interne velden weg, waaronder:

- CSRF tokens;
- grid parameters;
- GWT dispatcher velden;
- file upload velden;
- lege waarden;
- `__FIELD_INACTIVE__` en vergelijkbare Realworks metadata.

Voor velden met een `__MASK` wordt een leesbaar `<veld>_label` toegevoegd.

## Foutgedrag

- Geen betrouwbare sleutel: payload niet gebruiken voor automatische koppeling.
- Onbekende of incomplete payload: registreren als sync-event of quarantaine.
- Platform mag bestaande projectstatussen niet terugzetten op basis van
  Realworks-save.
- Ontbrekende of onzekere gegevens blijven controlepunten in het project.
