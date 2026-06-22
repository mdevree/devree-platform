# AI Belassistent - caller contract

Deze koppeling is bedoeld als dunne laag tussen het platform en de echte PBX/AI-caller.
Het platform blijft leidend: een medewerker keurt eerst de belkaart goed en klikt daarna pas op
`Start caller`.

## Benodigde platform env vars

- `AI_CALL_START_WEBHOOK_URL`: n8n webhook die de goedgekeurde belkaart ontvangt.
- `AI_INFO_EMAIL_WEBHOOK_URL`: n8n webhook die na afloop een interne info-mail verstuurt.
- `N8N_WEBHOOK_SECRET`: gedeeld secret; het platform stuurt dit mee als `x-webhook-secret`.

## Benodigde n8n env vars

- `AI_CALLER_API_URL`: endpoint van de echte AI/PBX-caller.
- `AI_CALLER_API_KEY`: bearer token of API-key voor de echte AI/PBX-caller.
- `AI_CALL_MAX_DURATION_SECONDS`: maximale gespreksduur, bijvoorbeeld `900`.
- `AI_CALL_VOICEMAIL_MODE`: bijvoorbeeld `short_message_or_hangup`.

Er staat een importeerbare workflow klaar in `n8n/AI Belassistent Start Caller.workflow.json`.
Die workflow blijft inactive totdat de echte caller endpoint en credentials bekend zijn.

## Start caller webhook

Endpointvoorbeeld:

```text
POST https://automation.devreemakelaardij.nl/webhook/ai-belassistent/start
```

Headers:

```text
x-webhook-secret: <N8N_WEBHOOK_SECRET>
content-type: application/json
```

Payload vanuit het platform:

```json
{
  "job": {
    "id": "ai-call-job-id",
    "source": "bezichtiging",
    "contactName": "Trudie Verduijn",
    "contactPhone": "+316...",
    "language": "nl",
    "propertyTitle": "Kikkerven 255",
    "propertyAddress": "Kikkerven 255",
    "propertyUrl": "https://www.devreemakelaardij.nl/...",
    "context": {
      "source": "bezichtiging",
      "signals": {},
      "allowedLinks": []
    },
    "scriptPreview": "Opening: ...",
    "status": "calling"
  }
}
```

Vereist gedrag in n8n/caller:

- Weiger requests zonder geldig `x-webhook-secret`.
- Bel alleen `job.contactPhone`.
- Gebruik `job.scriptPreview` en `job.context`; verzin geen kantoor- of woningcontext.
- Spreek de bedrijfsnaam uit als `De Vree Makelaardij`.
- Vat aan het einde samen en vraag: `Klopt dit zo?`
- Hang daarna actief op via de caller/PBX API.
- Gebruik een technische maximale gespreksduur als vangnet.
- Bij voicemail: markeer `outcome` als `voicemail` en voer geen lang gesprek.
- Bij stilte of TTS-problemen: markeer `outcome` als `failed` met `audioNotes`.

## Call result terug naar platform

Endpoint:

```text
POST https://kantoor.devreemakelaardij.nl/api/ai/call-results
```

Headers:

```text
x-webhook-secret: <N8N_WEBHOOK_SECRET>
content-type: application/json
```

Minimale payload:

```json
{
  "aiCallJobId": "ai-call-job-id",
  "pbxCallId": "provider-call-id",
  "provider": "pbx-ai-caller",
  "durationSeconds": 420,
  "outcome": "answered",
  "summary": "Korte zakelijke samenvatting van het gesprek.",
  "transcript": "Volledig transcript indien beschikbaar.",
  "customerQuestions": [
    "Vraag over woonoppervlakte"
  ],
  "detectedOpportunities": [
    "verkoop"
  ],
  "requestedFollowUp": {
    "terugbellen": true,
    "whatsapp": true
  },
  "proposedLinks": [
    {
      "title": "Woning verkopen",
      "url": "https://www.devreemakelaardij.nl/verkoop/",
      "type": "verkoop",
      "purpose": "verkoop"
    }
  ],
  "audioNotes": "Geen bijzonderheden.",
  "qualityScore": 8
}
```

Het platform doet daarna automatisch:

- Mautic-notitie toevoegen.
- Mautic-tags/punten toevoegen.
- Interne info-mail webhook aanroepen, als `AI_INFO_EMAIL_WEBHOOK_URL` is ingesteld.
- WhatsApp-concepten klaarzetten, maar niet automatisch verzenden.

## Info-mail webhook

Endpointvoorbeeld:

```text
POST https://automation.devreemakelaardij.nl/webhook/ai-belassistent/info-email
```

Payload vanuit het platform:

```json
{
  "to": "info@devreemakelaardij.nl",
  "subject": "AI-belgesprek: Trudie Verduijn - Kikkerven 255",
  "job": {},
  "result": {}
}
```

De n8n-workflow stuurt hiervan een interne e-mail met:

- Naam en telefoonnummer.
- Woning.
- Samenvatting.
- Vragen/signalen/kansen.
- Gewenste opvolging.
- Link naar Mautic/contact of platform waar mogelijk.

## PBX open punt

SSH naar `136.144.249.189:22` time-out vanaf:

- lokale uitgaande IP: `109.36.136.96`
- platformserver: `136.144.253.219`

Voor echte PBX-configuratie moet een van deze IP's tijdelijk in de trusted zone, of moet de callerconfig via TransIP-console worden aangepast.

Aanvullende poortscan vanaf lokaal en vanaf de platformserver: `22`, `80`, `443`, `5038`, `8088`, `8089`, `5060` en `5160` zijn dicht. Daarmee zijn SSH, HTTP-beheer, Asterisk AMI, Asterisk ARI en directe SIP-aansturing niet bereikbaar vanaf deze omgeving.
