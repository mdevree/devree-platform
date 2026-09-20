# FAQ zoeken en nieuwsbrief

WordPress: `devree-kadence-child/inc/faq-discovery.php`, `archive-faq.php`, `assets/js/dv-faq-search.js`. Alle gepubliceerde vragen staan in HTML; zoeken/filteren is progressieve JavaScript. Zoekacties worden na 1 seconde rust of Enter vastgelegd met Matomo `trackSiteSearch(query, 'FAQ / Onderwerp', resultCount)`. Geen ruwe invoer in URL's. Mogelijke e-mailadressen, telefoonnummers en URLs worden niet gemeten. Analytics blijft afhankelijk van trackingtoestemming, browserblokkades en de bestaande Matomo-configuratie; dit is geen volledige registratie van alle bezoekers.

Het kantoorplatform is de redactieplek. De bestaande handmatige contentbank blijft behouden. Dagelijkse import bewaart brongegevens apart van redactionele tekst. De zoekrapportage vergelijkt de laatste 30 volledige dagen met de 30 dagen ervoor. API-fouten worden als fout getoond en wissen de laatste goede meting niet. Tellingen zijn zoekacties, geen unieke mensen.

Maandelijks ontstaat maximaal één concept met maximaal drie nog niet ingedeelde vragen. Alleen na een expliciete goedkeuring van de huidige versie mag deze naar Mautic als ongepubliceerd concept. Elke wijziging maakt die goedkeuring ongeldig. De bestaande doelgroep is segment 33. De timer exporteert/verzendt niets. In Mautic activeren/plannen/verzenden blijft een afzonderlijke menselijke stap. Een bevestigde `sentCount > 0` markeert gekoppelde onderwerpen gebruikt; dat bewijst geen inboxbezorging.

Aanmelden gebruikt een afzonderlijke Mautic-template met een persoonlijke bevestigingslink van 48 uur. Een GET of scannerbezoek schrijft niemand in: de bezoeker bevestigt met een POST. Bestaande actieve inschrijvingen krijgen geen nieuwe bevestigingsmail. DNC wordt gerespecteerd. De bestaande dynamische segmentregel verwerkt `nieuwsbrief=1`; er is geen handmatige herinschrijving in segment 33. Tokens en e-mailadressen worden niet gelogd; de lokale registratie bevat HMAC van het adres, Mautic-ID, bron en toestemmingsversie.

## Installeren

1. Voer `prepare-production.py` als root op de bestaande host uit. Dit maakt een gerichte backup, maakt/vindt de ongepubliceerde bevestigingstemplate en configureert het bestaande Compose-bestand. Geheimen blijven op de server. Het script verstuurt geen e-mail.
2. Deploy de platformcommit via de normale main/GHCR-workflow. Entrypoint voert uitsluitend `prisma migrate deploy` uit. Controleer SHA, route `/nieuwsbrief`, publieke OPTIONS en databasekolommen.
3. Deploy de genoemde themabestanden met backup. Voer `wp eval-file .../scripts/migrate-faq-topics.php` eerst droog uit, daarna met `DV_FAQ_TOPICS_APPLY=1`. Controleer aantallen en REST-veld `newsletter`.
4. Installeer `run.sh` als `/usr/local/sbin/devree-newsletter-maintenance` (0755), units in `/etc/systemd/system`, `systemctl daemon-reload`, enable de twee timers. Dagelijks 06:00 en maandelijks op de eerste dag om 09:00, Europe/Amsterdam. Bekijk `journalctl -u devree-newsletter@daily` bij storingen.
5. Draai de synchronisatie eenmaal. Bereid de eerste editie voor met `{month:true,first:true}` op de beveiligde sync-route. Controleer dat status DRAFT is en Mautic-ID leeg; keur niet automatisch goed.

## Controle

- `npm run verify` en `npm run build`.
- `node --test tests/faq-search.test.cjs` in het theme.
- MariaDB-ketentest: `node --env-file=.env.local --import tsx --test src/lib/newsletter/integration.test.ts`, alleen met aparte database waarvan de URL `/devree_newsletter_qa_` bevat. Alle externe API's zijn gemockt; geen productiecontacten of echte verzending.
- Browser: zoeken op titel/transcript, combinatie met onderwerp, nul resultaten, wissen, terugnavigatie, mobiel en toetsenbord. Zonder JS moeten alle vragen leesbaar zijn; aanmelden staat uit zonder JS.
- Redactie: wijzig een goedgekeurd blok, controleer nieuwe conceptstatus; opnieuw exporteren houdt hetzelfde ID; extern gewijzigd/geactiveerd concept moet blokkeren.
- Live aanmelding: gebruik alleen een expliciet aangewezen testadres, controleer ontvangen bericht, daadwerkelijke bevestiging en segmentlidmaatschap. Voer geen massatest met bestaande abonnees uit.

## Herstel

Zet `NEWSLETTER_SIGNUP_ENABLED=false` en herstart uitsluitend het platform om aanmelden te pauzeren. Stop beide timers als bronupdates ongewenst zijn. Een vastgelopen export wordt bewust geblokkeerd; controleer de externe draft en versie voordat `exportLockAt` gericht wordt vrijgegeven. Voer niet blind opnieuw een create uit. Schema-uitbreidingen zijn additief: een oude app-image kan terug zonder kolommen/tabellen te verwijderen. Herstel bij een echt dataprobleem alleen de betrokken gegevens uit de vooraf gemaakte backup. Bewaar inschrijvingen die na de backup binnenkwamen.

Referenties: https://devdocs.mautic.org/en/7.2/rest_api/emails.html en https://developer.matomo.org/api-reference/tracking-javascript (API-capaciteiten zijn ook tegen de geïnstalleerde Mautic-bron gecontroleerd).
