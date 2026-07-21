# Taxatie-bronwaarden: conflictvalidatie en taxateursreview

## Doel en veiligheidsprincipe

De conflictmodule bewaart alle waarnemingen uit documenten en andere bronnen naast elkaar. Een bronprioriteit, nieuwste timestamp of meerderheidsregel mag nooit stilzwijgend een rapportwaarde kiezen.

- Eén unieke, nog niet beoordeelde waarde krijgt status `unresolved`.
- Twee of meer afwijkende waarden krijgen status `conflict`.
- Alleen een taxateur kan een bronwaarde kiezen of handmatig een waarde invoeren. Daarna is de status `confirmed`.
- Een nieuwe afwijkende bronwaarde na een bevestiging maakt die bevestiging inactief en opent het conflict opnieuw.
- Bij zo'n heropening worden eerder gepropageerde canonieke/exportwaarden leeggemaakt; de oude keuze blijft volledig bewaard in `taxateur_bevestigd` en `audit_log`.
- `GET /api/taxaties/dossier?projectId=...&view=export` blokkeert zolang een geregistreerd bronveld `unresolved` of `conflict` is.

De eerste concrete velddefinitie is `zonnepanelen_vermogen_wp`. De engine zelf ondersteunt ook tekst, datum, boolean en numerieke toleranties. Nieuwe velden worden centraal en expliciet toegevoegd aan `SOURCE_FIELD_DEFINITIONS` in `src/lib/taxatieSourceConflicts.ts`; zo kan een request niet zelf willekeurige dossierpaden laten overschrijven.

## Datamodel in dossier.json

De module voegt `bronwaarde_validatie` toe en gebruikt de bestaande top-level `audit_log`.

```json
{
  "bronwaarde_validatie": {
    "schemaVersion": "1.0",
    "fields": {
      "zonnepanelen_vermogen_wp": {
        "key": "zonnepanelen_vermogen_wp",
        "label": "Opgesteld vermogen zonnepanelen",
        "dataType": "number",
        "unit": "Wp",
        "rule": {
          "type": "number",
          "absoluteTolerance": 0,
          "integer": true
        },
        "targets": [
          { "path": "object.zonnepanelen.vermogen_wp", "value": "confirmed" },
          { "path": "energetische_opnamestaat.items.24.aantal_of_wattpiek_type", "value": 0, "export": true },
          { "path": "energetische_opnamestaat.items.24.aantal_of_wattpiek", "value": "confirmed", "export": true }
        ],
        "sourceValues": [
          {
            "id": "...",
            "value": 2063,
            "normalizedValue": 2063,
            "unit": "Wp",
            "source": {
              "type": "document",
              "document": "energielabel.pdf",
              "path": "/2026/Voorbeeldstraat 1/2 Rechercheren/energielabel.pdf",
              "page": 1,
              "field": "opgesteld_vermogen",
              "extract": "Opgesteld vermogen 2063 Wp"
            },
            "observedAt": "2026-07-21T08:00:00.000Z",
            "recordedAt": "2026-07-21T08:02:00.000Z",
            "recordedBy": "n8n:document-verwerker"
          },
          {
            "id": "...",
            "value": 1898,
            "normalizedValue": 1898,
            "unit": "Wp",
            "source": {
              "type": "document",
              "document": "opnameverslag.pdf",
              "page": 2,
              "field": "zonnepanelen_wp"
            },
            "observedAt": "2026-07-21T08:01:00.000Z",
            "recordedAt": "2026-07-21T08:03:00.000Z",
            "recordedBy": "n8n:opnameverwerker"
          }
        ],
        "status": "conflict",
        "distinctValues": [2063, 1898],
        "taxateur_bevestigd": null,
        "lastEvaluatedAt": "2026-07-21T08:03:00.000Z"
      }
    },
    "openConflicts": ["zonnepanelen_vermogen_wp"],
    "unresolvedFields": [],
    "lastValidatedAt": "2026-07-21T08:03:00.000Z"
  },
  "audit_log": [
    {
      "timestamp": "2026-07-21T08:03:00.000Z",
      "actor": "n8n:opnameverwerker",
      "action": "source_value_registered",
      "field": "zonnepanelen_vermogen_wp",
      "details": {
        "previousStatus": "unresolved",
        "status": "conflict"
      }
    }
  ]
}
```

Na bevestiging bevat `taxateur_bevestigd` onder meer `value`, `method`, `sourceValueId`, `confirmedBy`, `confirmedAt`, `note` en `active`. De bevestiging en elk geraakt doelpad worden als `source_value_confirmed` in `audit_log` vastgelegd.

## API-contracten

### Bronwaarden registreren vanuit n8n

`POST /api/taxaties/bronwaarden` gebruikt de bestaande `x-webhook-secret`-authenticatie.

```json
{
  "projectId": "platform-project-id",
  "actor": "document-verwerker",
  "observations": [
    {
      "field": "zonnepanelen_vermogen_wp",
      "value": 2063,
      "unit": "Wp",
      "observedAt": "2026-07-21T08:00:00.000Z",
      "source": {
        "type": "document",
        "document": "energielabel.pdf",
        "path": "/2026/Voorbeeldstraat 1/2 Rechercheren/energielabel.pdf",
        "page": 1,
        "field": "opgesteld_vermogen",
        "extract": "Opgesteld vermogen 2063 Wp"
      }
    }
  ]
}
```

De operatie is per bron idempotent. Zonder expliciet `id` wordt een stabiele id afgeleid uit veld, waarde, bronverwijzing en `observedAt`. De API schrijft met de Nextcloud-ETag (`If-Match`); gelijktijdige wijzigingen geven HTTP 409 in plaats van elkaars dossier te overschrijven.

### Taxateur bevestigt

`POST /api/taxaties/conflicten/bevestig` accepteert uitsluitend een ingelogde platformsessie, niet alleen het n8n-secret.

Kiezen uit een bron:

```json
{
  "projectId": "platform-project-id",
  "field": "zonnepanelen_vermogen_wp",
  "sourceValueId": "bronwaarde-id",
  "note": "Gecontroleerd op het actuele energielabel"
}
```

Handmatig invoeren:

```json
{
  "projectId": "platform-project-id",
  "field": "zonnepanelen_vermogen_wp",
  "manualValue": 2100,
  "note": "Factuur en paneeltype ter plaatse gecontroleerd"
}
```

### Dossier ophalen voor export

- `GET /api/taxaties/dossier?projectId=...` geeft dossier en validatiesamenvatting terug.
- `GET /api/taxaties/dossier?projectId=...&view=export` geeft alleen een dossier terug als alle geregistreerde bronvelden bevestigd zijn.

Bij bevestiging van zonnepanelenvermogen propageert de module naar:

- `object.zonnepanelen.vermogen_wp`;
- `energetische_opnamestaat.items.24.aanwezig = 1`;
- `energetische_opnamestaat.items.24.aantal_of_wattpiek_type = 0` (Aantal Wattpiek);
- `energetische_opnamestaat.items.24.aantal_of_wattpiek`;
- `exports.bevestigde_bronwaarden.zonnepanelen_vermogen_wp`.

De bestaande Realworks-generator leest daarmee uitsluitend de door de taxateur bevestigde waarde uit item 24.

## Integratie in n8n

Importeer `n8n/Taxatie Bronwaarden Valideren.workflow.json`. Dit is een subworkflow met `Execute Workflow Trigger`; hij hoeft niet als losse trigger actief te zijn.

1. Laat iedere document-/opname-agent naast zijn gewone `dossier_update` een array `bronwaarden` teruggeven. Een element bevat altijd `field`, `value`, `unit`, `observedAt` en een concrete `source`.
2. Voeg na het parsen van de agentoutput een `Execute Workflow`-node toe die `projectId`, `actor` en `bronwaarden` doorgeeft aan `Taxatie — Bronwaarden Valideren` en wacht op voltooiing.
3. Laat de Dossierbeoordelaar `bronwaarde_validatie.openConflicts` én `unresolvedFields` als blokkerende gaps opnemen.
4. Laat rapport-/Realworksflows dossierdata ophalen via de exportweergave. Een HTTP-fout is dan een expliciete stopconditie; gebruik geen `force` om een bronconflict te omzeilen.
5. De taxateur behandelt de review op de projectpagina onder `Taxatiecontrole`. De platformroute schrijft bevestiging, propagatie en audit trail atomisch naar hetzelfde `dossier.json`.

De historische n8n-workflows `Taxatie — Document Verwerker`, `Taxatie — Dossierbeoordelaar` en `Taxatie — Rapport Genereren` stonden bij implementatie uitgeschakeld. Deze wijziging activeert ze daarom niet automatisch. Koppel de subworkflow wanneer die flows opnieuw in gebruik worden genomen.

## Nieuwe bronvelden toevoegen

Voeg een definitie toe aan `SOURCE_FIELD_DEFINITIONS` met:

- stabiele `key`, label, datatype en optionele eenheid;
- een vergelijkingsregel (`exact`, `text`, `number`, `date` of `boolean`);
- alleen whitelisted propagatiepaden;
- bij numerieke waarden een expliciete absolute en/of relatieve tolerantie;
- tests voor gelijk, conflict, bevestiging, propagatie en nieuwe afwijkende brondata.

Doelpaden komen nooit uit een n8n-payload. Hierdoor kan een foutieve of gemanipuleerde bronwaarneming niet buiten de vooraf beoordeelde dossier- en exportvelden schrijven.
