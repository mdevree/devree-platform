# CLAUDE.md

Werknotities voor agents die aan het De Vree Makelaardij kantoorplatform werken.

## Belangrijke werkwijze

- Lees dit bestand en `README.md` voordat je wijzigingen maakt.
- Werk conservatief: gebruik bestaande patronen, voorkom brede refactors en deploy alleen gericht gewijzigde bestanden.
- Er kunnen lokale wijzigingen staan die niet van jou zijn. Niet resetten of terugdraaien zonder expliciete toestemming.
- Voor productie-deploys wordt de GHCR-image gebruikt; zet de live compose-image pas om nadat de image-tag bestaat.
- n8n imports deactiveren workflows standaard. Na import altijd workflow opnieuw activeren en n8n restarten als de CLI meldt dat wijzigingen anders niet actief worden.

## Bezichtiging-opvolging (WhatsApp-concepten)

- `POST /api/ai/follow-up-drafts/prepare-bezichtigingen` maakt WhatsApp-concepten voor bezichtigingen van 24-48 uur geleden. Aangeroepen door n8n-workflow `Bezichtiging Follow-up Concepten` (elk uur) of handmatig via de Concepten-tab.
- Altijd human-in-the-loop: concepten (`purpose: bezichtiging_followup`, `createdBy: auto_bezichtiging`) worden nooit automatisch verzonden. Het bestaande goedkeur/verzendpad (`sendFollowUpDraft`) niet aanraken.
- Skip-regels staan als pure, geteste beslislogica in `src/lib/bezichtigingFollowUp.ts` (`beslisFollowUp`). Outbound WhatsApp vóór de bezichtiging (afspraakbevestiging) telt bewust níét als contact; inbound vanaf 48 uur ervoor wél.
- Idempotency via unique `(agendaAfspraakId, purpose)` op `FollowUpDraft`. Branches nooit versoepelen zonder de unique te respecteren (P2002 = skip, geen fout).
- Instellingen in `AppSetting` key `bezichtiging_followup` (venster/caps/template/rcodeTracking/enabled); laatste run in `bezichtiging_followup_last_run`.
- `isBezichtigingType` en de enrich-logica staan gedeeld in `src/lib/agendaEnrich.ts`; WhatsApp-JID-normalisatie gedeeld in `src/lib/phone.ts` (`toWhatsAppJid`).
- Aandachtspunt: skip op e-mailcontact leunt op `MauticEvent` `email.send`; controleer bij Mautic-webhookwijzigingen dat dit event doorkomt.

## Voorstel verkoopopdracht en OTD

De voorstel-flow is klantgevoelig. Het systeem moet gegevens verzamelen en controleren, maar mag niet te vroeg automatisch naar de klant mailen of laten tekenen.

### Klantflow

- Publieke voorstelpagina: `/voorstel/[token]`.
- Preview zonder tracking: voeg `?preview=1` toe.
- Bij akkoord krijgt de klant geen directe Documenso-tekenlink.
- Na akkoord toont de pagina: de opdracht wordt gecontroleerd, eerst door de makelaar ondertekend, daarna ontvangt de klant per e-mail een uitnodiging om digitaal te ondertekenen.
- Na ondertekening maakt kantoor de digitale klantomgeving op Move.nl aan.

### Klanttaal

- Gebruik geen interne termen zoals Realworks op de publieke voorstelpagina.
- Gebruik "aangeleverde gegevens" en "gegevens uit het Kadaster".
- Publiciteitskosten-tekst:
  "Dit is het maximale budget voor de presentatie van de woning, zoals Funda, fotografie, meetrapport, 360 graden foto's, video en plattegronden."
- Energielabel-tekst:
  "Indien gewenst zetten wij de opdracht voor u uit om een energielabel te laten opmaken. Een energielabel is verplicht voordat we de woning online publiceren. Als u al een energielabel heeft of dit zelf regelt, kunt u dat aangeven."
- Quickscan fundering is optioneel en wordt alleen getoond bij `kostenBouwkundig > 0`.

### Gegevens voor de opdracht

- Het blok **Gegevens voor de opdracht** staat lager op de voorstelpagina, niet als losse sectie boven de keuzes.
- Bekende opdrachtgevers staan onder de groene toelichting.
- **Opdrachtgever toevoegen** staat als actiekaart rechts naast de bestaande opdrachtgeverkaart in dezelfde grid; op mobiel eronder.
- Bestaande opdrachtgevergegevens kunnen worden aangepast met **Gegevens aanpassen**.
- Extra opdrachtgevers worden als nieuw Mautic-contact aangemaakt en aan het project gekoppeld.
- Bestaande opdrachtgevercorrecties mogen alleen Mautic-contacten bijwerken die aan dit project gekoppeld zijn.

### Back-up per e-mail

- Bij akkoord gaat er een mail naar `info@devreemakelaardij.nl`.
- Die akkoordmail moet alle ingevulde keuzes, aangepaste bestaande opdrachtgevers, extra opdrachtgevers en opmerkingen bevatten. Dit is bewust als back-up als er achter de schermen iets misgaat.
- Bij **Vraag of opmerking versturen** gaat ook een back-upmail naar `info@devreemakelaardij.nl` met de volledige ingestuurde payload.
- De n8n workflow `AI Belassistent - Info Email` wordt hiervoor hergebruikt en accepteert generieke `subject` + `html` payloads.

### Mautic en geboortedatum

- `geboortedatum` is een algemeen Mautic-contactveld, geen `otd_*` veld.
- Het eerder aangemaakte `otd_geboortedatum` hoort niet gebruikt te worden en is verborgen.
- OTD-specifieke velden:
  - `otd_aanhef`
  - `otd_initialen`
  - `otd_voornamen`
  - `otd_geboorteplaats`
  - `otd_burgerlijke_staat`
- Klantweergave van geboortedatum is `DD-MM-YYYY`.
- HTML date-inputs gebruiken intern `YYYY-MM-DD`; dat is normaal.
- n8n/Realworks moet meerdere aliases accepteren voor geboortedatum, zoals `birthdate`, `birth_date`, `date_of_birth`, `rbirthdate`, `prbirthdate`, `dob`.

## Aankoopvoorstel en aankoop-OTD

- Aankoopprojecten (`type = AANKOOP`) gebruiken dezelfde voorstel-flow; alle branches zijn expliciet `type === "AANKOOP"` (nooit `!== "VERKOOP"`, anders trekt TAXATIE mee).
- De verkoopflow is klantgevoelig en moet ongewijzigd blijven; aankoop heeft eigen componenten (`AankoopProposalPage`, `AankoopChoiceForm`, `aankoopHtml.ts`) naast de verkoopvarianten.
- Aankoop kent geen offertefase: voorstellink en akkoord zetten het project op `OTD_VERSTUURD` (niet `OFFERTE_VERSTUURD`).
- Klantpagina aankoop: alleen gegevens controleren + opmerkingen + akkoord. Geen verkoopstart, stille verkoop, energielabel of quickscan.
- Tariefdefaults staan in `src/lib/otdAankoop.ts` (`DEFAULT_AANKOOP_TARIEVEN`); projectvelden `aankoopTariefVast`, `aankoopToeslagExtraWoning`, `aankoopMaxWoningen`, `aankoopKostenNietDoorzetten`, `aankoopWerkgebied` en hergebruikte `kostenIntrekking`/`kostenBedenktijd` overschrijven ze. `null` of `0` = default, zodat de PDF nooit lege bedragen toont.
- Documenso-bijlagen aankoop via env `DOCUMENSO_OTD_AANKOOP_ATTACHMENT_ITEM_IDS` (ACV + Aankoopvoorwaarden 2026). Het Aankoopvoorwaarden-item moet in Documenso geüpload zijn vóór livegang.
- Bij een projecttype-wissel worden OPEN voorstellinks automatisch gerevoked.

## Documenso

- Documenso draait op `ondertekenen.devreemakelaardij.nl`.
- Documentlinks moeten team-scoped zijn, bijvoorbeeld `/t/melvin/documents/[id]/edit`; `/documents/[id]` kan 404 geven.
- Het concept mag vaste bijlagen bevatten, maar klanten mogen geen interne URL zoals `kantoor.devreemakelaardij.nl` hoeven te zien.
- Voor OTD: kantoor controleert het concept en de makelaar tekent eerst. Daarna pas de klant uitnodigen.

## Realworks extensie en n8n

- Browserextensie staat lokaal onder `~/LocalDev/devree-realworks-browserext`.
- Realworks-contactsync moet defensief blijven: geen incomplete e-mails, geen brede XHR-posts en geen contactupdates zonder betrouwbare sleutel.
- Kadastrale gegevens en geboortedatum kunnen uit Realworks komen, maar veldnamen wisselen per scherm. Voeg liever aliases toe dan aannames.
- Na n8n workflow import:
  1. Workflow opnieuw activeren.
  2. n8n restarten als n8n meldt dat wijzigingen anders niet actief worden.
  3. Controleren of de mapping in de geëxporteerde workflow terug te vinden is.

## Deploynotities

- Server: `136.144.253.219`.
- Platform stack: `/home/DeVreeMakelaardij/stacks/devree-platform`.
- Server-side push checkout: `/home/DeVreeMakelaardij/tmp/devree-platform-push`.
- Betrouwbare deploy is handmatig image tag in compose vervangen, image pullen, container stoppen/verwijderen en `docker-compose up -d --no-deps devree-platform`.
- Controleer daarna:
  - `docker ps --filter name=devree-platform`
  - `curl -I http://127.0.0.1:3100/digitale-medewerker` moet naar `/login` redirecten.

## Testen

- Minimaal draaien bij platformwijzigingen:
  - `npm run typecheck`
  - `npm test -- --run src/lib/otd.test.ts`
- Bij publieke voorstelwijzigingen ook server-side HTML checken op belangrijke woorden/teksten.
- Lokale Playwright kan door macOS/sandbox blokkeren; als visuele check niet lukt, vermeld dat expliciet.
