# Realworks-contacten, met en zonder e-mailadres

De contacttak van `Realworks platform Sync` (`BXamv0Exk1GFQRE6`) verwerkt nieuwe
en opnieuw opgeslagen relaties. Er is geen automatische herverwerking van oude
quarantaine-items. Mautic blijft de contactbron voor project- en voorstelkeuze.

## Invoer en identiteit

De bestaande webhook `POST /webhook/realworks-sync` ontvangt de bestaande
Realworks-velden met `source: realworks`. Vanaf extensie 1.13 bevat `_sync` ook
`eventType`, `realworksPath`, `traceId`, `payloadHash` en `extensionVersion`.
Oudere extensies zonder `_sync` blijven ondersteund op deze specifieke webhook.

Een lege e-mail is toegestaan met `_systemid`/`systemid` of `rcode` en ten minste
een voor- of achternaam. Een ingevulde ongeldige e-mail, ontbrekende identificatie
of een andere bronroute wordt afgewezen. Bestaande aanvragen met alleen een
geldig e-mailadres blijven ondersteund. De Mautic-velden voor Realworks-codes
vereisen numerieke waarden; testfixtures voor live tests moeten hieraan voldoen.

Alle zoekvragen zijn exact en lezen ook de bestaande identifiers terug:

- `realworks_code` en `systemid` hebben voorrang; een bestaand `field1` wordt
  gecontroleerd tegen die matches en identifiers.
- Een niet-bestaand `field1` wordt alleen hersteld via een vaste Realworks-match.
- E-mail is uitsluitend een terugval als er geen vaste match is en aanwezige
  namen/identifiers elkaar niet tegenspreken. Een e-mailadres op een ander
  contact veroorzaakt een conflict, geen samenvoeging.
- Zoekfouten, onvolledige antwoorden en meerdere matches veroorzaken nooit een
  aanmaak. Naam of telefoonnummer worden niet zelfstandig gebruikt om te koppelen.

Bij schrijven worden lege/ontbrekende velden weggelaten. Een lege e-mail wist dus
geen bestaand e-mailadres. Aanvullen/wijzigen gebruikt PATCH op hetzelfde
Mautic-ID. Teruglezen controleert ID, Realworks-identifiers, namen en ingevulde
e-mail. `field1` wordt alleen teruggeschreven als het nog niet overeenkomt.

## Antwoord en herhaling

Succes: `{"status":"ok","mauticContactId":123,"matchStrategy":"realworks_code",...}`.
De bestaande status blijft behouden. `matchStrategy` is `realworks_code`,
`systemid`, `mautic_id`, `email` of `new`.

HTTP 422 betekent ongeldige invoer, 409 een identiteitsconflict en 502 een niet
bevestigde zoek-, schrijf-, teruglees- of terugschrijfactie. Fouten bevatten
`status`, `code` en `reason`. De extensie plaatst 409/422 in de bestaande
quarantaine en registreert technische fouten als mislukte synchronisatie.

De extensie onderdrukt identieke verzendingen gedurende de lopende aanvraag en
30 seconden na bevestigd succes. De hash bevat contactinhoud en bronroute,
geen tijdstempel of willekeurige trace-ID. Na fouten kan direct opnieuw worden
geprobeerd. Een succesvolle herhaling werkt een eerder mislukt platform-event
met dezelfde hash bij naar `processed`.

## Bron, tests en invoering

`browserext/contact-sync.js` wordt gedeeld met de gegenereerde n8n-code.
`n8n/lib/` bevat de contactherkenning, bestaande veldmapping en veldallowlist.
De uitvoer `n8n/Realworks Contact Sync.branch.json` bevat alleen de contacttak;
serverheaders zijn gemarkeerd als `__PRESERVE_SERVER_HEADER__`.

Genereer met `node scripts/build-realworks-contact-workflow.mjs <veilige-export>`.
Test met `npm run verify`. De gerichte tests voeren ook de echte extensiecode uit
en vergelijken de platformvalidatie met de gedeelde regels.

`scripts/deploy-realworks-contact-workflow.py` draait uitsluitend op de n8n-host:
`preview`, `candidate` of `apply`, gevolgd door het pad naar de branch-export.
Het script leest authenticatie alleen lokaal, maakt een afgeschermde back-up en
laat alle andere workflowtakken intact. `candidate` maakt een apart testwebhook;
daar is uitsluitend de Realworks-terugschrijftaak gesimuleerd zodat fictieve IDs
niet in de echte schrijftaken belanden. Controleer de echte terugschrijfroute
apart met een herkenbare testrelatie in Realworks.

Volgorde: platformdeploy, gepubliceerde workflow, daarna versie 1.13 van de
extensie laden. Chrome gebruikt lokaal `/Users/melvin/LocalDev/devree-realworks-browserext`;
de platformrepo is de bron. Maak een bestandsback-up en kopieer alleen de
gewijzigde extensiebestanden; herlaad de extensie en daarna de Realworks-testtab.
Een rollback herstelt code/workflow, zonder reeds aangemaakte contacten te wissen.
