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
