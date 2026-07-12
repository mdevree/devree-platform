# Realworks Browser Extensie

Chrome-extensie die data uit de Realworks CRM haalt en doorstuurt naar n8n, en optioneel velden terugschrijft vanuit n8n naar Realworks.

## Wat doet het

### Lezen (Realworks → n8n)

| Bron | Getriggerd door | Webhook |
|------|----------------|---------|
| Relatie (contactpersoon) | Opslaan van een relatie in Realworks | `realworks-sync` |
| Agenda | Openen van een agendadag in Realworks | `realworks-agenda-sync` |
| Taxatierapport | Versturen van een taxatieformulier in Realworks | `realworks-taxatie-sync` |
| Lead Response (kijker) | Opslaan van een bezichtigingsreactie (`broker.response/save`) | `realworks-lead-response` |
| Woning (object) | Opslaan van een woning (`broker.brokerobject/save`) | `realworks-woning-sync` |
| Backup/discovery | XHR/fetch-verkeer op `backup.realworks.nl` en relevante historie/correspondentie-calls op `crm.realworks.nl` | Platform API `/api/realworks-backup-captures` → optioneel n8n `realworks-backup-capture` |

De extensie onderschept form-submits en XHR-calls op `crm.realworks.nl` en stuurt de relevante velden als JSON naar de n8n webhook. Interne Realworks-velden (CSRF-tokens, grid-parameters, maskers) worden weggefilterd.

#### Backup/discovery capture

Voor Realworks-onderdelen waarvan de endpointstructuur nog onbekend is, injecteert de extensie ook op `backup.realworks.nl`. Het injected script onderschept `fetch` en XHR responses met tekst/JSON/HTML-achtige content, kapt de response af op 200.000 tekens en stuurt metadata + body-preview via de background worker naar:

```http
POST https://kantoor.devreemakelaardij.nl/api/realworks-backup-captures
x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

De platform-API accepteert alleen `backup.realworks.nl` en `crm.realworks.nl` captures. Als `REALWORKS_BACKUP_CAPTURE_WEBHOOK_URL` is gezet, wordt daarnaar doorgestuurd; anders gebruikt de API standaard:

```text
<N8N_URL>/webhook/realworks-backup-capture
```

Op `backup.realworks.nl` is de capture relatief breed zodat we kunnen ontdekken waar correspondentie/historie zit. Op `crm.realworks.nl` filtert de capture op hints zoals `correspond`, `histor`, `mail`, `bericht`, `dossier`, `memo`, `rela.` en `broker.` zodat bestaande syncs niet overspoeld worden.

#### Lead Response payload

Bij het opslaan van een bezichtigingsreactie (`broker.response/save`) wordt de functie `extractLeadResponse()` aangeroepen in `injected.js`. `__MASK`-waarden worden gedecodeerd naar leesbare labels via `decodeMask()`.

```json
{
  "source": "realworks_lead_response",
  "resprcode": "891537",
  "rlisnr": "SE11845",
  "contact": { "voornaam": "...", "achternaam": "...", "email": "...", "telefoon": "..." },
  "lead": {
    "herkomstCode": "6", "herkomst": "Funda Lead",
    "labelCode": "1",    "label": "Koop",
    "statusCode": "1",   "status": "Nieuw"
  },
  "kwalificatie": {
    "aanvragerType": "Particulier",
    "heeftEigenWoning": false,
    "overwegtVerkoopWoning": false,
    "hypotheekAdviesStatus": "Nee"
  },
  "memo": { "intern": "...", "publiek": "..." },
  "makelaarCode": "100001"
}
```

De n8n workflow (`Realworks Lead Response → Mautic Kwalificatie`) zoekt het contact op in Mautic via e-mail, maakt het aan als het niet bestaat, en vult de kijker-kwalificatievelden in.

#### Woning payload

Bij het opslaan van een woning (`broker.brokerobject/save`) wordt de multipart-POST op netwerkniveau onderschept in `background.js` (net als bij taxaties, omdat GWT `form.submit()`-interceptie onbetrouwbaar is). Interne velden (CSRF-tokens, maskers, grid-parameters, `.default`-velden, file-uploads) worden weggefilterd. Voor elk veld met een `__MASK` wordt een leesbaar `<veld>_label` toegevoegd; `_display`-velden blijven behouden.

```json
{
  "source": "realworks",
  "objectcode": "SE11798",
  "lisstreet": "Groede",
  "liststrnr": "62",
  "soortwoning": "1",
  "typewoning": "4",
  "typewoning_label": "Tussenwoning",
  "lissalepr": "400.000,00",
  "lisstate": "4",
  "lisstate_label": "Verkocht onder voorbehoud",
  "energieklasse": "4",
  "energieklasse_label": "B",
  "voorzieningwonen_display": "Mechanische ventilatie, Rolluiken, TV kabel, ..."
}
```

De woning wordt geïdentificeerd via `objectcode`/`lisnr` (bijv. `SE11798`); de write-back cache wordt gekeyd op `_systemid` (bijv. `9042120`).

### Schrijven (n8n → Realworks)

Via een taakwachtrij op de kantoorserver kan n8n opdrachten aanmaken om één veld in een Realworks-record bij te werken. De extensie pollt de wachtrij elke 30 seconden en voert openstaande taken uit via de actieve browsersessie.

| Wachtrij-endpoint | Record-type |
|-------------------|-------------|
| `/api/realworks-tasks` | Relaties |
| `/api/realworks-taxatie-tasks` | Taxatierapporten |
| `/api/realworks-woning-tasks` | Woningen (objecten) |

## Hoe het technisch werkt

```
crm.realworks.nl (browser)
    │
    ├─ injected.js      draait in de paginacontext, onderschept XHR en form-submits
    │                   → stuurt postMessages naar content.js
    │
    ├─ content.js       ontvangt de postMessages
    │                   → stuurt data naar n8n-webhooks
    │                   → stuurt raw formdata naar background.js voor caching
    │                   → pingt background.js elke 30s om schrijftaken op te pakken
    │
    └─ background.js    service worker
                        → cachet formdata per record-ID (inclusief CSRF-token)
                        → pollt de taakwachtrij elke minuut (fallback via alarm)
                        → voert schrijftaken uit door de gecachte form body te replayen
                          met het gewijzigde veld
```

### Waarom formulierdata cachen?

Realworks gebruikt GWT-formulieren met een CSRF-token dat eldig is voor de duur van de sessie. Om een veld terug te schrijven moeten we het volledige formulier opnieuw versturen — anders accepteert Realworks de POST niet. De extensie slaat bij elke form-submit de volledige body op (per record-ID) in `chrome.storage.local` zodat dit later mogelijk is.

**Gevolg:** een terugschrijftaak werkt alleen als het betreffende record eerder in dezelfde browsersessie is geopend (en opgeslagen).

### Schrijftaak aanmaken (vanuit n8n)

```http
POST https://kantoor.devreemakelaardij.nl/api/realworks-tasks
x-webhook-secret: <N8N_WEBHOOK_SECRET>
Content-Type: application/json

{
  "taskType": "write_field",
  "realworksRelationId": "12345",
  "fieldName": "field1",
  "fieldValue": "nieuwe waarde"
}
```

Voor taxaties:

```http
POST https://kantoor.devreemakelaardij.nl/api/realworks-taxatie-tasks
x-webhook-secret: <N8N_WEBHOOK_SECRET>
Content-Type: application/json

{
  "taskType": "write_field",
  "realworksTaxatieId": "2849636",
  "fieldName": "taxverkoopvrij",
  "fieldValue": "325000"
}
```

Voor woningen:

```http
POST https://kantoor.devreemakelaardij.nl/api/realworks-woning-tasks
x-webhook-secret: <N8N_WEBHOOK_SECRET>
Content-Type: application/json

{
  "taskType": "write_field",
  "realworksWoningId": "9042120",
  "fieldName": "lissalepr",
  "fieldValue": "395.000,00"
}
```

> `realworksWoningId` is het `_systemid` van het object (niet de objectcode). Een terugschrijftaak werkt alleen als de woning eerder in dezelfde browsersessie is opgeslagen, zodat de extensie de multipart-body (incl. CSRF-token) kon cachen.

### Taakstatus

Een taak doorloopt de statussen `pending → processing → done / failed`. De claim op `processing` is atomisch: als twee extensies tegelijk draaien pakt maar één de taak op (de ander krijgt HTTP 409).

## Installeren

1. Open Chrome → `chrome://extensions`
2. Schakel **Ontwikkelaarsmodus** in (rechtsboven)
3. Klik **Unpacked laden** en selecteer de `browserext/` map
4. Open **Details → Extensieopties** en vul het webhook-secret in. Dit moet
   gelijk zijn aan `N8N_WEBHOOK_SECRET` op de VPS.

De extensie is actief zodra je ingelogd bent op `crm.realworks.nl`.

## Traceerbaarheid

De extensie stuurt bij nieuwe payloads metadata mee:

- `traceId` — unieke ID voor het event;
- `payloadVersion` — contractversie van de payload;
- `extensionVersion` — versie uit `manifest.json`;
- `capturedAt` — moment waarop de extensie de payload vastlegde;
- `sourceHost` of bron-URL waar beschikbaar.

De optiespagina toont lokaal de extensieversie en laatste syncstatus.

## Bestanden

| Bestand | Rol |
|---------|-----|
| `manifest.json` | Extensieconfiguratie (permissions, content scripts) |
| `injected.js` | Draait in de paginacontext; onderschept XHR, fetch en form-submits |
| `content.js` | Brug tussen pagina en background worker; stuurt webhooks/captures aan |
| `background.js` | Service worker; cachet formulierdata, verwerkt schrijftaken en verstuurt backup-captures |
