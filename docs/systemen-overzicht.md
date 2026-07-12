# De Vree Makelaardij systemenoverzicht

Laatst bijgewerkt: 2026-07-12.

Dit document legt vast welke systemen onderdeel zijn van de De Vree Makelaardij
stack, waar de broncode of configuratie staat, hoe productie draait en welke
punten nog gecontroleerd moeten worden. Bewaar hier geen secrets, wachtwoorden,
private keys of API tokens.

## Kantoorplatform

| Onderdeel | Waarde |
| --- | --- |
| Doel | Centraal kantoorplatform voor agenda, projecten, OTD/voorstellen, taken, kansen, telefonie, WhatsApp, Mautic, Realworks-sync en digitale medewerker |
| Lokale repo | `/Users/melvin/LocalDev/DeVreeMakelaardij` |
| GitHub | `git@github.com:mdevree/devree-platform.git` |
| Productie-image | `ghcr.io/mdevree/devree-platform:3741a1f` |
| Live revision | `3741a1f983cf7d1f4c0907a36d472182172d54eb` |
| Server | `136.144.253.219` |
| Stackpad | `/home/DeVreeMakelaardij/stacks/devree-platform` |
| Deployscript | `/usr/local/sbin/deploy-devree-platform <tag>` |
| Healthcheck | `http://127.0.0.1:3100/digitale-medewerker` op de server |
| Status op 2026-07-12 | Container draait, deploylog meldt succesvolle deploy om 12:39 CEST |

Lokale aandachtspunten:

- De lokale checkout had op 2026-07-12 meerdere niet-gecommitte wijzigingen.
- De lokaal bekende `origin/main` liep niet gelijk met de live revision; een
  directe `git ls-remote` faalde lokaal door GitHub SSH-auth.
- CI bouwt en pusht een GHCR-image op `main`. De workflow kan productie bijwerken
  als `DEVREE_DEPLOY_SSH_KEY` in GitHub Actions bestaat.

## Productiecontainers op platformserver

Op 2026-07-12 draaiden op `136.144.253.219` onder andere:

| Container | Image | Rol |
| --- | --- | --- |
| `devree-platform` | `ghcr.io/mdevree/devree-platform:3741a1f` | Kantoorplatform |
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
| Productie branch/status op 2026-07-12 | `main`, commit `8239c57`, 12 lokale wijzigingen |
| Lokale map | `/Users/melvin/LocalDev/devree-kadence-child` |

Te controleren:

- Welke 12 lokale serverwijzigingen bewust zijn.
- Of die wijzigingen naar GitHub moeten worden gecommit en gepusht.
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
| Lokale repo | `/Users/melvin/LocalDev/debiteuren-administratie` |
| GitHub | `https://github.com/mdevree/debiteuren-administratie.git` |
| Lokale status op 2026-07-12 | `main`, geen lokale wijzigingen |
| Platformkoppeling | `DEBITEUREN_API_URL`, `DEBITEUREN_API_TOKEN`, `NEXT_PUBLIC_DEBITEUREN_URL` |

Te controleren:

- Productiepad en deploymethode.
- API-contract tussen debiteurensysteem en platform.

## Lokale mappen en bronstatus

| Map | Status/interpretatie |
| --- | --- |
| `/Users/melvin/LocalDev/DeVreeMakelaardij` | Hoofdrepo voor platform |
| `/Users/melvin/LocalDev/debiteuren-administratie` | Losse GitHub repo |
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
