# De Vree AI PBX bridge

Deze map bevat de reproduceerbare versie van de bridge die op de PBX draait.

## Doel

- Ontvangt goedgekeurde belkaarten vanuit het platform op `POST /start`.
- Weigert startverzoeken zonder expliciet approval-blok met `humanApproved: true`, `approvalText: "BEL"` en `reviewedBy`.
- Maakt een eenmalige outbound campaign/lead aan in de Asterisk AI Voice Agent database.
- Pollt afgeronde outbound attempts.
- Schrijft gesprekresultaten terug naar `https://kantoor.devreemakelaardij.nl/api/ai/call-results`.
- Extraheert eenvoudige opvolgvelden uit het transcript: `customerQuestions`, `requestedFollowUp` en `proposedLinks`.

## Productiepad

- Script: `/opt/devree-ai-bridge/app.py`
- Service: `/etc/systemd/system/devree-ai-bridge.service`
- Healthcheck: `http://127.0.0.1:3099/health`
- Publiek start-endpoint: `http://136.144.249.189:3099/start`
- Standaard AI-context: `devree_bezichtiging_followup`

De bridge draait naast de Asterisk AI Voice Agent container `ai_engine`. De admin UI van die agent luistert op `http://pbx.devreemakelaardij.nl:3003/`, maar is alleen bereikbaar voor IP's in de PBX trusted firewall-zone.

## Startcontract

Het platform/n8n stuurt een payload met minimaal:

```json
{
  "job": {
    "id": "cmq...",
    "contactName": "Sanne de Jong",
    "contactPhone": "0612636255",
    "language": "nl",
    "propertyTitle": "Kikkerven 255",
    "propertyAddress": "Kikkerven 255",
    "propertyUrl": "https://www.devreemakelaardij.nl/aanbod/",
    "context": {},
    "scriptPreview": "Opening en belinstructies..."
  },
  "approval": {
    "humanApproved": true,
    "approvalText": "BEL",
    "reviewedBy": "medewerker"
  }
}
```

Zonder approval-blok moet de bridge HTTP 400 teruggeven. Dit is bewust dubbel geborgd: zowel platform als bridge eisen menselijke vrijgave.

## Resultaatcontract

Na afloop post de bridge naar het platform:

```json
{
  "aiCallJobId": "cmq...",
  "pbxCallId": "1782155103.103",
  "provider": "google_live",
  "contextName": "devree_bezichtiging_followup",
  "durationSeconds": 42,
  "outcome": "answered",
  "summary": "Korte samenvatting",
  "transcript": "assistant: ...\nuser: ...",
  "customerQuestions": [],
  "detectedOpportunities": [],
  "requestedFollowUp": {},
  "proposedLinks": []
}
```

De transcript-parser is heuristisch. Voor productiegebruik is een latere schema- of LLM-extractiestap wenselijk, vooral voor subtiele verkoopkansen en concrete klantvragen.

## Niet committen

De productie `.env` staat op `/opt/devree-ai-bridge/.env` en bevat secrets. Die hoort niet in Git.

Benodigde variabelen:

```env
WEBHOOK_SECRET=...
PLATFORM_RESULT_URL=https://kantoor.devreemakelaardij.nl/api/ai/call-results
DB_PATH=/root/Asterisk-AI-Voice-Agent/data/call_history.db
DEFAULT_CONTEXT=devree_bezichtiging_followup
LISTEN_HOST=0.0.0.0
LISTEN_PORT=3099
```

## Deploy/herstel

```bash
mkdir -p /opt/devree-ai-bridge
cp app.py /opt/devree-ai-bridge/app.py
cp devree-ai-bridge.service /etc/systemd/system/devree-ai-bridge.service
chmod 0644 /opt/devree-ai-bridge/app.py /etc/systemd/system/devree-ai-bridge.service
systemctl daemon-reload
systemctl enable --now devree-ai-bridge
systemctl status devree-ai-bridge --no-pager
curl -sS http://127.0.0.1:3099/health
```

Gebruik dit alleen nadat de `.env` op de PBX aanwezig is.

## Snelle checks

```bash
systemctl is-active devree-ai-bridge
curl -sS http://127.0.0.1:3099/health
docker ps --filter name=ai_engine
docker logs --since 10m --tail=200 ai_engine
fwconsole firewall list trusted
```

Bij live tests moet de ontvanger direct iets zeggen na opnemen. Stilte kan door AMD als voicemail/initial silence worden gezien.
