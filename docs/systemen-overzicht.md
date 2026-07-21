# De Vree Makelaardij systemenoverzicht

Laatst bijgewerkt: 2026-07-21.

Dit document legt vast welke systemen onderdeel zijn van de De Vree Makelaardij
stack, waar de broncode of configuratie staat, hoe productie draait en welke
punten nog gecontroleerd moeten worden. Bewaar hier geen secrets, wachtwoorden,
private keys of API tokens.

## Kantoorplatform

| Onderdeel | Waarde |
| --- | --- |
| Doel | Centraal kantoorplatform voor agenda, projecten, OTD/voorstellen, taken, kansen, telefonie, WhatsApp, Mautic, Realworks-sync en digitale medewerker |
| Lokale repo | `/Users/melvin/LocalDev/DeVreeMakelaardij` |
| Actieve werkmap debiteurenverbetering | `/Users/melvin/LocalDev/devree-platform-debiteuren-secops` |
| GitHub | `git@github.com:mdevree/devree-platform.git` |
| Productie-image | `ghcr.io/mdevree/devree-platform:<short-sha>` via GitHub Actions op `main` |
| Laatste functionele app-revision | `045268c` |
| Server | `136.144.253.219` |
| Stackpad | `/home/DeVreeMakelaardij/stacks/devree-platform` |
| Deployscript | `/usr/local/sbin/deploy-devree-platform <tag>` |
| Healthcheck | `http://127.0.0.1:3100/digitale-medewerker` op de server |
| Runtime/CI | Node 24 in GitHub Actions en lokaal gecontroleerd met Node `v24.16.0` |
| Status op 2026-07-21 | Appcode `045268c` gecontroleerd; latere docs-only deploys kunnen een hogere image-tag hebben zonder runtimewijziging. Loginroute `200`, beschermde routes `307`, API zonder sessie `401`, directe debiteurenfactuur-read vanuit container gecontroleerd, recente logs schoon |

Lokale aandachtspunten:

- De lokale checkout had op 2026-07-12 meerdere niet-gecommitte wijzigingen.
- De lokaal bekende `origin/main` liep niet gelijk met de live revision; een
  directe `git ls-remote` faalde lokaal door GitHub SSH-auth.
- CI bouwt en pusht een GHCR-image op `main`. De workflow kan productie bijwerken
  als `DEVREE_DEPLOY_SSH_KEY` in GitHub Actions bestaat.
- Op 2026-07-21 is de debiteurenintegratie in kleine commits live gezet en na
  iedere stap gecontroleerd. GitHub Actions meldt nog een waarschuwing dat enkele
  Docker actions intern Node 20 targeten, maar ze worden door de workflow op Node
  24 uitgevoerd.

### Productiechecks 2026-07-21

Uitgevoerd na de debiteurenverbeteringen:

| Commit | Wijziging | Controle |
| --- | --- | --- |
| `e9b5278` | Adreswaarschuwingen uit Mautic kunnen in `/debiteurencontrole` als gecontroleerd worden gemarkeerd, inclusief notitie/auditvelden | `npm run verify` groen; productie-DB backup gemaakt; container `e9b5278`; `/login` `200`; `/debiteurencontrole` `307`; `/api/debiteuren/controle` `401`; review-endpoint zonder sessie `401`; logs schoon |
| `c6196c3` | Platformfacturen synchroniseren status, betaaldatum, verlopenstatus, laatste sync en syncmelding vanuit de debiteurensamenvatting | `npm run verify` groen; productie-DB backup gemaakt; container `c6196c3`; `/login` `200`; projectroute met `focus=debiteuren` `307`; `/debiteurencontrole` `307`; `/api/debiteuren/controle` `401`; logs schoon |
| `04c7573` | Centrale debiteurencontrole toont verlopen/niet-gesynchroniseerde platformfacturen als aandachtspunt | `npm run verify` groen; container `04c7573`; `/login` `200`; `/debiteurencontrole` `307`; `/api/debiteuren/controle` `401`; logs schoon |
| `045268c` | Platform haalt factuurstatussen direct op via `InvoiceReadV1` in plaats van via de klantsamenvatting | `npm run verify` groen; GitHub Actions-run `29866532137` groen; container `045268c`; `/login` `200`; `/debiteurencontrole` `307`; `/api/debiteuren/controle` `401`; directe factuur-read vanuit container geeft gecontroleerd `404 not_found` voor niet-bestaande factuur; logs schoon |
| `6ae5674` | Documenteert de live `InvoiceReadV1`-status en debiteurenproductiepad; geen runtimewijziging | GitHub Actions-run `29867054524` groen; container `6ae5674`; `/login` `200`; `/debiteurencontrole` `307`; `/api/debiteuren/controle` `401`; logs schoon |
| `18cb705` | Projectfactuurflow gegeneraliseerd naar taxatie, verkoop en aankoop met dezelfde preview, expliciete `FACTUUR`-bevestiging en idempotency per project/factuurtype | `npm run verify` groen met 105 tests; GitHub Actions-run `29868282237` groen; container `18cb705`; `/login` `200`; `/debiteurencontrole` `307`; `/api/debiteuren/controle` `401`; factuur-preview zonder sessie `401`; logs schoon |

Back-ups vóór directe productie-DB wijzigingen:

- `/home/DeVreeMakelaardij/backups/devree-platform-pre-debiteuren-warning-review-20260721215920.sql`
- `/home/DeVreeMakelaardij/backups/devree-platform-pre-debiteuren-invoice-status-sync-20260721220956.sql`

## Productiecontainers op platformserver

Op `136.144.253.219` draaien onder andere:

| Container | Image | Rol |
| --- | --- | --- |
| `devree-platform` | `ghcr.io/mdevree/devree-platform:<short-sha>` | Kantoorplatform |
| `n8n-n8n-1` | `n8nio/n8n:latest` | Automatiseringen en webhooks |
| `documenso-app` | `documenso/documenso:latest` | Digitaal ondertekenen |
| `documenso-db` | `postgres:16-alpine` | Documenso database |
| `gotenberg` | `gotenberg/gotenberg:8` | PDF-generatie |
| `waha-test` | `devlikeapro/waha:noweb` | WhatsApp provider/test |
| `portainer` | `portainer/portainer-ce:latest` | Containerbeheer |
| `metomo_matomo_1` | `matomo:latest` | Analytics |
| `postiz` | `ghcr.io/gitroomhq/postiz-app:latest` | Social/content tooling |
| `temporal` | `temporalio/auto-setup:1.28.1` | Workflow runtime voor Postiz/afhankelijke stack |

Te controleren:

- Welke containers bewust productie zijn en welke test/legacy zijn.
- Of `latest` tags voor n8n, Documenso, Matomo en Postiz bewust worden gebruikt
  of beter gepind moeten worden.
- Waar composebestanden voor de losse containers beheerd worden; in
  `/home/DeVreeMakelaardij/stacks` werd alleen de platform-compose gevonden.

## n8n automation

| Onderdeel | Waarde |
| --- | --- |
| Publieke host | `automation.devreemakelaardij.nl` |
| Container | `n8n-n8n-1` |
| Lokale workflow exports | `n8n/*.json` in de platformrepo |
| Server hints | `/home/DeVreeMakelaardij/backups/n8n-workflows`, `/home/DeVreeMakelaardij/web/automation.devreemakelaardij.nl` |

Belangrijke workflows in de repo:

- `AI Belassistent Start Caller.workflow.json`
- `AI Belassistent Info Email.workflow.json`
- `Realworks Agenda Sync.json`
- `Realworks -> Mautic Contact Sync.json`
- `Realworks Lead Response -> Mautic Kwalificatie.json`
- `Realworks Mutatielijst -> Platform Kansen.json`
- `Kansen Concept -> Platform.json`
- `Taxatie Mailarchivering.workflow.json`
- `n8n-email-verwerking.workflow.json`
- `n8n-facebook-dm-trigger.workflow.json`

Operationele regels:

- Na import van een workflow wordt n8n standaard gedeactiveerd; workflow opnieuw
  activeren en n8n herstarten als de CLI dat vereist.
- Niet iedere n8n Code-node kan `$env` lezen. De AI info-mail workflow is daarom
  aangepast om geen `$env` in de Code-node nodig te hebben.
- Per workflow hoort duidelijk te zijn: bron, trigger, payloadcontract,
  foutafhandeling, retrybeleid en laatste productie-export.

## Realworks browserextensie

| Onderdeel | Waarde |
| --- | --- |
| Lokale map in platformrepo | `browserext/` |
| Losse lokale map | `/Users/melvin/LocalDev/devree-realworks-browserext` |
| Doel | Realworks lezen, backup/discovery captures, en schrijftaken uitvoeren via actieve browsersessie |
| Belangrijkste endpoints | `/api/realworks-tasks`, `/api/realworks-taxatie-tasks`, `/api/realworks-woning-tasks`, `/api/realworks-backup-captures` |

Risico's en aandachtspunten:

- De extensie is kritisch voor data-instroom uit Realworks.
- Terugschrijven werkt alleen als de gebruiker het record eerder in dezelfde
  browsersessie heeft geopend/opgeslagen, omdat de extensie formulierdata en
  CSRF-context nodig heeft.
- De README in de extensie noemt nog dat het secret in `background.js` gezet moet
  worden, terwijl er ook een options-pagina bestaat. Dit moet gelijkgetrokken
  worden.
- Voeg een expliciete extensieversie toe aan alle platform-events.

## PBX en AI-belassistent

| Onderdeel | Waarde |
| --- | --- |
| PBX server | `136.144.249.189` |
| Lokale notities | `/Users/melvin/LocalDev/DeVreePBX/PBX_NOTES.md` |
| Bridge in platformrepo | `pbx/devree-ai-bridge/` |
| Productie bridgepad | `/opt/devree-ai-bridge/app.py` |
| Service | `devree-ai-bridge.service` |
| Healthcheck | `http://127.0.0.1:3099/health` op de PBX |
| Status op 2026-07-12 | Bridge actief, health geeft `ok: true` en context `devree_bezichtiging_followup` |
| PBX RAM op 2026-07-12 | Ongeveer 860 MB totaal, 278 MB beschikbaar |

Open productiepunten:

- PBX heeft beperkte capaciteit; voor stabiele realtime audio is minimaal 2 GB
  RAM wenselijk, liever 4 GB.
- Actieve context moet volledig dynamische belkaartcontext gebruiken en geen oude
  testcontext.
- Transcript-parser is heuristisch; voor productie is gestructureerde extractie
  nodig voor klantvragen, opvolging en kansen.
- Live audio, barge-in, transcript van klantturns en automatisch ophangen moeten
  opnieuw end-to-end getest worden.

## WordPress en Kadence child theme

| Onderdeel | Waarde |
| --- | --- |
| Sitepad | `/home/DeVreeMakelaardij/web/devreemakelaardij.nl/public_html` |
| Child theme pad | `wp-content/themes/kadence-child/` |
| GitHub | `git@github.com:mdevree/devree-kadence-child.git` |
| Productie branch/status op 2026-07-12 | `main`, commit `8451e67`; Git-status schoon |
| Lokale map | `/Users/melvin/LocalDev/devree-kadence-child` |
| Backupbestanden | Verplaatst naar `/home/DeVreeMakelaardij/backups/kadence-child/20260712-calendly-functions-backups` |

Te controleren:

- Welke WordPress onderdelen door het platform worden gebruikt: woning-CPT,
  buurtdata-widget, linkcatalogus, FAQ's en aanbodlinks.

## Mautic

| Onderdeel | Waarde |
| --- | --- |
| Host | `connect.devreemakelaardij.nl` |
| Serverpad | `/home/DeVreeMakelaardij/web/connect.devreemakelaardij.nl/public_html` |
| Rol | CRM, contactvelden, segmentatie, emailactiviteit, AI data profiel |

Te controleren:

- Declaratieve lijst van verplichte contactvelden en segmenten.
- Welke velden leidend zijn voor OTD, verkoopgesprekstatus, kijkerkwalificatie en
  Realworks-koppeling.
- Of de workflow `Mautic Config Ensure` nog dry-run is en hoe productieconfig
  reproduceerbaar wordt gemaakt.

## Documenso en PDF

| Onderdeel | Waarde |
| --- | --- |
| Host | `ondertekenen.devreemakelaardij.nl` |
| Container | `documenso-app` |
| Database | `documenso-db` |
| PDF service | `gotenberg` |
| Platformgebruik | OTD-concepten en verkoopopdracht-flow |

Regels:

- Klanten krijgen niet direct een Documenso-tekenlink na akkoord.
- Kantoor controleert eerst, de makelaar tekent eerst, daarna krijgt de klant een
  uitnodiging.
- Documentlinks zijn team-scoped, bijvoorbeeld `/t/melvin/documents/[id]/edit`.

## WhatsApp

| Onderdeel | Waarde |
| --- | --- |
| Platformmodules | WhatsApp inbox, conversaties, follow-up drafts, afspraakherinneringen |
| Providers in env | Evolution of WAHA |
| Container op server | `waha-test` |

Te controleren:

- Welke provider productie is: Evolution, WAHA of beide.
- Of `waha-test` nog test is of feitelijk productie.
- Webhook-secret, delivery-status en retrybeleid moeten in een runbook komen.

## Debiteurenadministratie

| Onderdeel | Waarde |
| --- | --- |
| Lokale repo | `/Users/melvin/LocalDev/debiteuren-secops-work` |
| GitHub | `https://github.com/mdevree/debiteuren-administratie.git` |
| Productiepad | `/home/DeVreeMakelaardij/web/debiteuren.devreemakelaardij.nl/public_html` |
| Live revision | `cd76d08` |
| Laatste bekende codewijzigingen | ContactV1 customer-upsert API, gescheiden read/write/SSO tokens, projectfactuur preview/create API, direct `InvoiceReadV1` factuur-readcontract |
| Platformkoppeling | `DEBITEUREN_API_URL`, `DEBITEUREN_READ_API_TOKEN`, `DEBITEUREN_WRITE_API_TOKEN`, `DEBITEUREN_SSO_SECRET`, `NEXT_PUBLIC_DEBITEUREN_URL` |

Productiechecks debiteurensysteem 2026-07-21:

| Commit | Wijziging | Controle |
| --- | --- | --- |
| `90ebea0` | `ContactV1` customer-upsert API voor genormaliseerde Mautic-/platformcontacten | Syntax en tests groen; live API zonder token `401`; bestaande routes blijven bereikbaar |
| `3cf5e67` | `POST` customer-upserts met write-token en idempotente klantkoppeling | Syntax en tests groen; live zonder token `401`; geen testklanten aangemaakt |
| `9771df5` | Taxatiefactuur preview/create contract voor platformkoppeling | Syntax en tests groen; live write-contract alleen met token; geen productiefactuur aangemaakt |
| `cd76d08` | Direct `GET resource=v1/invoices/{invoiceId}` contract voor factuurstatussen | Lokale en live syntax groen; `tests/run.php` groen met 26 tests; live zonder token `401`; vanuit platformcontainer met read-token gecontroleerd `404 not_found` op niet-bestaande factuur |

Operationele notitie:

- De productiecheckout had geen bruikbare GitHub-auth voor `git pull` via HTTPS.
  Commit `cd76d08` is daarom gecontroleerd live gezet via gerichte filecopy met
  back-up, daarna is de servercheckout met een Git-bundle op exact dezelfde
  commit gezet. `git status --short` was daarna schoon.
  Back-up: `/home/DeVreeMakelaardij/backups/debiteuren-api-invoiceread-20260721223212/Api.php`.

Actuele platformintegratie op 2026-07-21:

- Contacten uit Mautic lopen via het vaste `ContactV1` contract en worden zowel
  in het platform als in het debiteurensysteem genormaliseerd. Twijfels over
  huisnummer, toevoeging, postcode/plaats of samengestelde adresregels worden
  als `normalizationWarnings` opgeslagen.
- `/debiteurencontrole` toont:
  - projecten met Mautic-contact maar zonder debiteurenlink;
  - open adresnormalisatiechecks;
  - afgehandelde adresnormalisatiechecks met reviewer/notitie;
  - taxatieprojecten die klaarstaan voor facturatie;
  - verlopen of niet-gesynchroniseerde platformfacturen;
  - recent via het platform aangemaakte facturen.
- Projectdetailpagina's openen vanaf de controlepagina direct op het
  facturatieblok via `?focus=debiteuren`.
- Taxatie-, verkoop- en aankoopfacturen kunnen vanuit het project worden
  voorbereid, gepreviewd en pas na expliciete `FACTUUR` bevestiging aangemaakt.
  De idempotency-key voorkomt dubbele platformfacturen per project en
  factuurtype. Bedragen worden nog bewust handmatig ingevoerd; automatische
  courtage-/tariefberekening is een aparte businessregelstap.
- Platformfacturen bewaren debiteuren-factuurnummer, bedrag, status
  (`open`, `overdue`, `paid`), betaaldatum, hash, laatste sync en syncfout.
- Factuurstatussen worden via het directe debiteurencontract
  `GET resource=v1/invoices/{invoiceId}` opgehaald; de oudere
  klantsamenvatting blijft voor klant/openstaand-overzicht.
- Het platform gebruikt gescheiden debiteurengeheimen voor read-only API,
  write-API en SSO; het oude gedeelde token is geen fallback.

Nog te controleren:

- Beslissen wanneer verkoop- en aankoopprojecten centraal als
  "klaar voor facturatie" in `/debiteurencontrole` moeten verschijnen.
- Businessregels vastleggen voor automatische verkoopcourtage of
  aankooppakketbedragen, voordat het platform bedragen zelf gaat voorstellen.

## Lokale mappen en bronstatus

| Map | Status/interpretatie |
| --- | --- |
| `/Users/melvin/LocalDev/DeVreeMakelaardij` | Hoofdrepo voor platform |
| `/Users/melvin/LocalDev/debiteuren-secops-work` | Losse debiteurenadministratie GitHub repo |
| `/Users/melvin/LocalDev/DeVreeMakelaardij-marketobjects` | Lokale kopie/werkmap, geen Git-repo |
| `/Users/melvin/LocalDev/devree-platform-dashboard-work2` | Lokale kopie/werkmap, geen Git-repo |
| `/Users/melvin/LocalDev/devree-platform-dashboard-work` | Lokale kopie/werkmap, geen Git-repo |
| `/Users/melvin/LocalDev/devree-realworks-browserext` | Losse extensiemap, geen Git-repo gevonden |
| `/Users/melvin/LocalDev/devree-kadence-child` | Lokale child theme map; productie heeft eigen server-side Git checkout |
| `/Users/melvin/LocalDev/DeVreePBX` | Lokale PBX-notities, geen Git-repo gevonden |
| `/Users/melvin/LocalDev/devree_youtube_edit` | Video/Remotion werkmap |
| `/Users/melvin/LocalDev/ha-umbrel-config` | Home Assistant/Umbrel configuratie |

Deze mappen niet verwijderen zonder eerst te bepalen of er unieke wijzigingen,
exports of productiedata in staan.

## Aanbevolen definitie van "bron van waarheid"

- Platformcode: GitHub repo `mdevree/devree-platform`.
- Platformproductie: GHCR image met korte commit-SHA tag in server compose.
- WordPress child theme: GitHub repo `mdevree/devree-kadence-child`, maar eerst
  server-side lokale wijzigingen verwerken.
- n8n: workflow exports in Git, plus productie-export na iedere wijziging.
- PBX bridge: `pbx/devree-ai-bridge/` in Git, productie via `/opt/devree-ai-bridge`.
- Mautic configuratie: declaratief document/script in Git.
- Secrets: alleen in productie-env, serverconfig of secret managers; nooit in Git.
