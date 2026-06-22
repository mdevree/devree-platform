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
- Bij stilte of geen TTS-audio: gesprek afbreken en als failed/no_audio markeren.

## Platformkoppeling

- Belkaarten worden voorbereid in het platform.
- Resultaten worden teruggeschreven naar Mautic als notitie en tags.
- WhatsApp follow-up blijft eerst een concept dat handmatig wordt goedgekeurd.
- De toegestane linkcatalogus komt uit WordPress voor actieve woningen en vragen, plus handmatige links voor aanbod, verkoop, aankoop, taxatie en afspraak plannen.

## Productiestatus 2026-06-22

- Platform draait op `ghcr.io/mdevree/devree-platform:32f32df`.
- Database-migratie `20260622_ai_belassistent` is toegepast.
- `/ai-belassistent` is bereikbaar achter login.
- `/api/ai/link-catalog` is bereikbaar met `x-webhook-secret`.
- Linkcatalogus-sync is getest: 6 woningen, 14 FAQ's, 5 handmatige links.
- Menselijke goedkeuring is technisch verplicht op `POST /api/ai/call-jobs/[id]/start`.
- Zonder `humanApproved` geeft start-call HTTP 400.
- Omdat `AI_CALL_START_WEBHOOK_URL` nog niet op productie staat, zet een goedgekeurde start de belkaart op `approved` en belt nog niet uit.

## Nog nodig voor volledige PBX-koppeling

- SSH/PBX-toegang herstellen naar `136.144.249.189:22`, of de bestaande AI-caller webhook/config via TransIP/PBX-console aanpassen.
- Productie-env `AI_CALL_START_WEBHOOK_URL` instellen op de echte n8n/caller start-webhook.
- Productie-env `AI_INFO_EMAIL_WEBHOOK_URL` instellen op de n8n info-mail workflow.
- n8n/caller moet na gesprek `POST /api/ai/call-results` aanroepen.
- Daarna pas end-to-end testen met een bewust goedgekeurde testbelkaart.
