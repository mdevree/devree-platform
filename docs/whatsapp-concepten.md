# WhatsApp-concepten

`/mobile/whatsapp-concepten` toont antwoordconcepten voor nieuwe één-op-één-berichten en bestaande WhatsApp-opvolgconcepten die op beoordeling wachten. De lijst deelt de bestaande platformlogin met de Kantoor-weergave van De Vree Platform voor iOS. Aan medewerkers worden alleen kantoorconcepten getoond waarvoor ze toegang hebben. Persoonlijke concepten zijn alleen toegankelijk voor `WHATSAPP_REPLY_OWNER_USER_ID`.

## Kantoorpilot

1. Pas de Prisma-migraties toe via de normale platformdeploy. Laat persoonlijk uitgeschakeld. Zet pas in een testomgeving `WHATSAPP_REPLY_OFFICE_ENABLED=1` en stel `WHATSAPP_REPLY_OPENAI_API_KEY` in. De huidige WAHA-webhook levert al `message.any`; behoud de afleverstatus- en PBX-events.
2. Genereer een vaste VAPID-sleutelset met `npx web-push generate-vapid-keys --json`. Sla die direct op in de serverconfiguratie als `WHATSAPP_WEB_PUSH_VAPID_PUBLIC_KEY` en `WHATSAPP_WEB_PUSH_VAPID_PRIVATE_KEY` en zet `WHATSAPP_DRAFT_PUSH_WORKER=1`. Laat de web-push-service het openbare kantoordomein als VAPID-subject gebruiken. Open `/mobile/whatsapp-concepten` in Safari op de iPhone en log in. Kies **Zet op beginscherm** met **Open als webapp** en open daarna het nieuwe pictogram. Zet **Kantoorconcepten** aan, tik op **Stuur testmelding** en controleer bezorgen en openen. Stel op iOS **Toon voorvertoning → Indien ontgrendeld** in.
3. Test met een gecontroleerde afzender drie korte appjes, één concept in ongeveer 20 seconden plus verwerkingstijd, één push en direct bewerken. Test ook twee medewerkers, een handmatig WhatsApp-antwoord en een automatische opvolging naar dezelfde ontvanger. Kijk na een afgebroken of onzekere verzending eerst in WhatsApp het resultaat na. Zet pas daarna de kantoorfunctie aan voor regulier gebruik.

Voor de optionele native iPhone-build zijn een APNs-capability, een notification service extension en de vier `WHATSAPP_APNS_*`-instellingen nodig. Web Push werkt vanuit de beginschermwebapp met de VAPID-sleutels.

## Persoonlijke pilot

Gebruik `docker-compose.whatsapp-personal.yml` als aparte stack op loopbackpoort 3103. Geef WAHA een eigen API-sleutel en leg de in de pilot geteste imageversie of digest vast met `WAHA_PERSONAL_IMAGE`. Stel de sessie in met `config.noweb.store.enabled=false` vóór het koppelen. Abonneer de webhook op `message.any` naar `https://kantoor.devreemakelaardij.nl/api/webhooks/whatsapp-personal`, met WAHA HMAC via `WAHA_PERSONAL_WEBHOOK_HMAC_KEY` en beperkte retries. Vul de WAHA-URL, API-sleutel, sessie en het platformgebruikers-ID in. Test eerst met een testnummer. Activeer het persoonlijk gebruik pas nadat de instelling en het nummer zijn gecontroleerd.

Mautic is voor persoonlijk een alleen-lezen filter. Een telefoonnummer moet precies één contact opleveren. Geef een gemengd of privécontact in Mautic de tag `whatsapp-persoonlijk-uitsluiten` om het uit te sluiten. `WHATSAPP_REPLY_PERSONAL_EXCLUSION_TAG` kan die tagnaam configureren. Test ook een contact dat kantoor én persoonlijk appt en controleer beide afzenders. Bij een WhatsApp-identificatie waarvoor geen telefoonnummer kan worden gevalideerd, blijft de verwerking gesloten.

Een push is een aanbod vanuit het platform. De iPhone kan de melding bijvoorbeeld vanwege Focus of de meldingsinstellingen later tonen. Het actuele concept wordt geladen zodra je erop tikt. De push-inhoud is versleuteld per toestel. Bij uitloggen via de platformapp wordt de registratie voor die sessie ingetrokken.

Voor het pauzeren van een onderdeel zet je uitsluitend de bijbehorende reply- of pushvlag op `0`. Verifieer reactiegedrag en push op het toestel opnieuw na een wijziging van WAHA-engine, signing of APNs-omgeving.
