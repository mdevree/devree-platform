# Realworks Browser Extensie

Chrome-extensie die data uit de Realworks CRM haalt en doorstuurt naar n8n, en optioneel velden terugschrijft vanuit n8n naar Realworks.

## Wat doet het

### Lezen (Realworks → n8n)

| Bron | Getriggerd door | Webhook |
|------|----------------|---------|
| Relatie (contactpersoon) | Opslaan van een relatie in Realworks | `realworks-sync` |
| Agenda | Openen van een agendadag in Realworks | `realworks-agenda-sync` |
| Taxatierapport | Versturen van een taxatieformulier in Realworks | `realworks-taxatie-sync` |

De extensie onderschept form-submits en XHR-calls op `crm.realworks.nl` en stuurt de relevante velden als JSON naar de n8n webhook. Interne Realworks-velden (CSRF-tokens, grid-parameters, maskers) worden weggefilterd.

### Schrijven (n8n → Realworks)

Via een taakwachtrij op de kantoorserver kan n8n opdrachten aanmaken om één veld in een Realworks-record bij te werken. De extensie pollt de wachtrij elke 30 seconden en voert openstaande taken uit via de actieve browsersessie.

| Wachtrij-endpoint | Record-type |
|-------------------|-------------|
| `/api/realworks-tasks` | Relaties |
| `/api/realworks-taxatie-tasks` | Taxatierapporten |

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

### Taakstatus

Een taak doorloopt de statussen `pending → processing → done / failed`. De claim op `processing` is atomisch: als twee extensies tegelijk draaien pakt maar één de taak op (de ander krijgt HTTP 409).

## Installeren

1. Open Chrome → `chrome://extensions`
2. Schakel **Ontwikkelaarsmodus** in (rechtsboven)
3. Klik **Unpacked laden** en selecteer de `browserext/` map
4. Zet het juiste webhook-secret in `background.js` (`WEBHOOK_SECRET`)

De extensie is actief zodra je ingelogd bent op `crm.realworks.nl`.

## Bestanden

| Bestand | Rol |
|---------|-----|
| `manifest.json` | Extensieconfiguratie (permissions, content scripts) |
| `injected.js` | Draait in de paginacontext; onderschept XHR en form-submits |
| `content.js` | Brug tussen pagina en background worker; stuurt webhooks aan |
| `background.js` | Service worker; cachet formulierdata en verwerkt schrijftaken |
