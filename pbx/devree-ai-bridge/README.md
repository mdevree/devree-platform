# De Vree AI PBX bridge

Deze map bevat de reproduceerbare versie van de bridge die op de PBX draait.

## Doel

- Ontvangt goedgekeurde belkaarten vanuit het platform op `POST /start`.
- Maakt een eenmalige outbound campaign/lead aan in de Asterisk AI Voice Agent database.
- Pollt afgeronde outbound attempts.
- Schrijft gesprekresultaten terug naar `https://kantoor.devreemakelaardij.nl/api/ai/call-results`.

## Productiepad

- Script: `/opt/devree-ai-bridge/app.py`
- Service: `/etc/systemd/system/devree-ai-bridge.service`
- Healthcheck: `http://127.0.0.1:3099/health`

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
