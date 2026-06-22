# AI-belassistent en PBX notities

## Doel

De AI-belassistent belt namens De Vree Makelaardij na een bezichtiging, vat het gesprek kort samen, vraagt of de samenvatting klopt en zet concrete opvolging klaar voor een medewerker.

## Belangrijke gespreksregels

- De assistent noemt altijd de volledige naam: De Vree Makelaardij.
- De assistent opent met de reden van bellen: opvolging van een specifieke bezichtiging.
- Vragen moeten concreet zijn: algemene indruk, interesse, twijfels, vragen, financiering op een voorzichtige manier, eigen woning/verkoop alleen als dat logisch uit de context volgt.
- Na de samenvatting vraagt de assistent expliciet of alles klopt.
- De assistent moet daarna zelf netjes afscheid nemen en het gesprek beeindigen.

## PBX/caller aandachtspunten

- Controleer of de caller na afronding actief een hangup uitvoert. In de test bleef het gesprek aan het einde doorlopen.
- Zet naast de AI-instructie ook een technische maximale gespreksduur als vangnet.
- Log per gesprek minimaal: provider call id, starttijd, eindtijd, duur, outcome, transcript, samenvatting en audio/probleemnotities.
- Bij voicemail: geen lang gesprek voeren, kort bericht achterlaten of ophangen afhankelijk van campagne-instelling.
- AMD/voicemaildetectie blijft in de route. Let op bij live tests: als de ontvanger stil blijft na opnemen, kan AMD dit terecht als voicemail/initial silence beoordelen en hangt de caller op.
- Bij stilte of geen TTS-audio: gesprek afbreken en als failed/no_audio markeren.

## Platformkoppeling

- Belkaarten worden voorbereid in het platform.
- Resultaten worden teruggeschreven naar Mautic als notitie en tags.
- WhatsApp follow-up blijft eerst een concept dat handmatig wordt goedgekeurd.
- De toegestane linkcatalogus komt uit WordPress voor actieve woningen en vragen, plus handmatige links voor aanbod, verkoop, aankoop, taxatie en afspraak plannen.

## Productiestatus 2026-06-22

- Platform draait op `ghcr.io/mdevree/devree-platform:20a05cb`.
- Database-migratie `20260622_ai_belassistent` is toegepast.
- `/ai-belassistent` is bereikbaar achter login.
- `/api/ai/link-catalog` is bereikbaar met `x-webhook-secret`.
- Linkcatalogus-sync is getest: 6 woningen, 14 FAQ's, 5 handmatige links.
- Menselijke goedkeuring is technisch verplicht op `POST /api/ai/call-jobs/[id]/start`.
- Zonder `humanApproved` en exacte bevestiging `approvalText: "BEL"` geeft start-call HTTP 400.
- De PBX bridge weigert startverzoeken zonder approval-blok met `humanApproved: true`, `approvalText: "BEL"` en `reviewedBy`.
- `AI_CALL_START_WEBHOOK_URL` staat op de PBX bridge: `http://136.144.249.189:3099/start`.
- `AI_INFO_EMAIL_WEBHOOK_URL` staat op de n8n workflow: `https://automation.devreemakelaardij.nl/webhook/ai-belassistent/info-email`.
- `/api/ai/caller-status` geeft `status: ready`, met caller, start-webhook en info-mail actief.

## PBX bridge

- Server: `136.144.249.189`.
- Service: `devree-ai-bridge.service`.
- Scriptpad op de PBX: `/opt/devree-ai-bridge/app.py`.
- Luistert op `0.0.0.0:3099`.
- Healthcheck: `http://136.144.249.189:3099/health`.
- De bridge maakt per goedgekeurde platform-belkaart een eenmalige outbound campaign/lead in de AI Voice Agent database.
- De bridge pollt afgeronde outbound attempts en post resultaten terug naar `https://kantoor.devreemakelaardij.nl/api/ai/call-results`.
- De bridge gebruikt dezelfde webhook-secret als het platform/n8n, maar die staat bewust niet in dit bestand.
- Asterisk context `aava-outbound-amd` is nodig voor outbound calls: de AI-engine springt na opnemen eerst naar deze AMD-context en keert daarna terug naar `Stasis(...,outbound_amd,...)`.
- De context staat op productie in `/etc/asterisk/extensions_custom.conf` en is als snippet vastgelegd in `pbx/asterisk/aava-outbound-amd.conf`.

## AI Voice Agent context

- Contextnaam: `devree_bezichtiging_followup`.
- Provider: `google_live`, omdat `openai_realtime` op deze installatie uitgeschakeld staat.
- Profiel: `telephony_ulaw_8k`.
- Tooling: `hangup_call` is beschikbaar en de prompt verplicht samenvatten, verificatie vragen en daarna zelf ophangen.
- De engine-log bevestigt dat `devree_bezichtiging_followup` geladen is en dat `google_live` ready is.

## Geteste keten

- Platform readiness: caller/start/result/info-mail allemaal `ready`.
- n8n info-mail webhook getest met proefpayload: HTTP 200.
- Platform resultaatverwerking getest met dummy job: `POST /api/ai/call-results` gaf HTTP 201, job werd `completed`, WhatsApp-concept werd aangemaakt, info-mail werd queued.
- PBX bridge poller getest met synthetische afgeronde outbound attempt: bridge stuurde resultaat naar platform en markeerde de attempt als `sent`.
- Live test op 2026-06-22 belde wel uit, maar eindigde direct omdat `aava-outbound-amd` ontbrak. Deze Asterisk context is daarna toegevoegd en met `dialplan show aava-outbound-amd` bevestigd.
- Live hertest op 2026-06-22 met job `cmqphez0t000hhq010kw662z0` gaf een piep en hing op. Oorzaak: AMD classificeerde als `MACHINE` met `INITIALSILENCE-2500-2500`, omdat de ontvanger stil bleef na opnemen. Voor handmatige tests dus direct iets zeggen na opnemen.
- Nieuwe testkaart klaar op 2026-06-22: `cmqphrzau000ohq01zakprhkx`, status `ready`, nog niet gestart.
- Dummy testdata is na de tests opgeruimd.

## Nog nodig voor volledige PBX-koppeling

- Een echte live outbound test uitvoeren via de menselijke goedkeuringsknop.
- Na de live test controleren: belt hij uit, spreekt hij direct, gebruikt hij de juiste context, hangt hij zelf op, komt de samenvatting terug in platform/Mautic/info-mail.
- Als de live audio aan het einde opnieuw versnelt of vervormt: AI Voice Agent audio/provider-log bewaren en sample-rate/streaming-instellingen nalopen.
