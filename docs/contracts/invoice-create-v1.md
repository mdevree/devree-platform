# Contract: InvoiceCreateV1

Laatst bijgewerkt: 2026-07-21.

Dit is het platformcontract voor factuurvoorbereiding richting het
debiteurensysteem. De eerste platformroute gebruikt alleen `preview`, zodat
kantoor een taxatiefactuur kan controleren voordat er een echte factuur wordt
aangemaakt.

## Platformroute

```http
POST /api/projecten/{id}/debiteuren/invoice-preview
Content-Type: application/json
```

Body:

```json
{
  "amountExcl": 650,
  "description": "Taxatierapport",
  "subject": "Taxatie Voorbeeldstraat 1",
  "bank": "rabo",
  "invoiceDate": null,
  "dueDate": null,
  "extra": null
}
```

Voorwaarden:

- gebruiker moet ingelogd zijn;
- project moet type `TAXATIE` zijn;
- project moet al een debiteurenklant-link hebben;
- `amountExcl` wordt expliciet gevraagd en niet uit projectvelden geraden.
- `description`, `subject`, `bank`, `invoiceDate` en `dueDate` kunnen door
  kantoor worden aangepast vóór preview en aanmaak.

## Debiteuren-contract

Het platform stuurt naar debiteuren:

```json
{
  "contractVersion": "InvoiceCreateV1",
  "source": "devree-platform",
  "customerId": 123,
  "invoiceType": "taxatie",
  "subject": "Taxatie Voorbeeldstraat 1",
  "invoiceDate": null,
  "dueDate": null,
  "bank": "rabo",
  "lines": [
    { "description": "Taxatierapport", "amountExcl": 650, "vatRate": 0.21 }
  ],
  "extra": null,
  "reference": {
    "platformProjectId": "project-id",
    "mauticContactId": 12345
  }
}
```

Preview gebruikt de write-token omdat dezelfde payload later zonder vormwijziging
naar de create-route kan. De create-route vereist daarnaast een stabiele
`X-Debiteuren-Idempotency-Key`.

## Definitief aanmaken

```http
POST /api/projecten/{id}/debiteuren/invoice-create
Content-Type: application/json
```

Body is gelijk aan de previewroute, met extra veld:

```json
{ "confirmation": "FACTUUR" }
```

De platformroute weigert de request zonder exacte bevestiging. Daarna gebruikt
het platform een vaste idempotency-key per project/taxatiefactuur:
`project:{projectId}:taxatie-invoice:v1`. Daardoor maakt een retry of dubbelklik
geen tweede factuur aan.

Na een succesvolle debiteuren-response legt het platform de factuur ook vast in
`project_debiteuren_invoices`. Die tabel is geen tweede factuurbron, maar een
project-anker voor platformworkflow:

- welke debiteurenfactuur bij het project hoort;
- welk factuurnummer/bedrag terugkwam uit debiteuren;
- welke idempotency-key gebruikt is;
- wie de actie vanuit het platform uitvoerde.

De projectkaart gebruikt deze historie om eerder via het platform aangemaakte
taxatiefacturen te tonen met een directe debiteurenlink. De debiteurenadministratie
blijft leidend voor betaling, openstaand saldo en factuurinhoud.
