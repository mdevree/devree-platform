# FAQ en nieuwsbrief — productieoplevering 20 september 2026

De vragenpagina is vernieuwd en live gecontroleerd op mobiel (360 px), tablet (768 px) en desktop. Na de terugkoppeling over de mobiele opmaak zijn vaste zijmarges, een compact zoekpaneel, vraagkaarten en een duidelijke overgang tussen nieuwsbrief, auteursregel en footer toegevoegd. FVM-assets en uitsluitend betrokken FAQ-paginacaches zijn ververst. Geen horizontale overflow op de gemeten breedtes.

## Gebouwd en actief

- `/vragen/`: zoeken in titel, kort antwoord en volledige transcriptie; synoniemen; een onderwerpfilter gecombineerd met de zoekterm; nulresultaatmelding; zoekstatus blijft behouden bij teruggaan vanuit een antwoord.
- 19 vragen hebben onderwerpindelingen. Alle antwoorden blijven zonder JavaScript leesbaar.
- Matomo registreert uitgevoerde zoekopdrachten met categorie en resultaataantal. Dubbele invoerevents worden onderdrukt. E-mailadressen, lange telefoonnummers en URL-invoer worden niet als zoekterm verstuurd. Analytics blijft afhankelijk van browser-/trackinginstellingen.
- Het bestaande nieuwsbriefscherm is uitgebreid met zoekinzichten over 30 volledige dagen, vorige periode, nulresultaten, opvolgstatus, notitie en gekoppeld antwoord.
- Bronimport behoudt handmatige redactionele tekst. 19 FAQ-items zijn toegevoegd; de bestaande 10 items zijn behouden.
- Aanmelden met e-mailadres en expliciete bevestiging via een aparte Mautic-template (#16, ongepubliceerd). Bestaande nieuwsbriefinschrijvingen blijven intact. De bestaande segmentregel draait iedere vijf minuten. Bezorging aan een echt testadres is nog niet gecontroleerd; het testadres is gevraagd.
- De bestaande doelgroep: segment 33, 19 leden, 19 bereikbare unieke adressen, 0 uitgesloten/dubbel volgens actuele API-controle.
- Dagelijkse bronverversing om 06:00, volgende maandvoorbereiding op 1 oktober 2026 om 09:00, Europe/Amsterdam. Beide timers zijn actief. Handmatige uitvoering van dezelfde dagelijkse service is succesvol.
- Eerste editie: `cmu9xbq6f000rhq01k0rjc782`, “Vragen en antwoorden – september 2026”. Onderwerpen: wettelijke bedenktijd, eigen bouwkundige keuring, lijst van zaken. Status DRAFT, revisie 1, geen goedkeuring, geen Mautic-export, verzendtelling 0.
- Een editie wordt pas na actuele goedkeuring naar een ongepubliceerd Mautic-concept geëxporteerd. Opnieuw exporteren hergebruikt het ID. Wijzigingen laten goedkeuring vervallen. Extern gewijzigde/geactiveerde Mautic-edities worden geblokkeerd. De maandtimer verzendt niets.

## Validatie en versies

- `npm run verify`: lint/typecheck geslaagd; 185 tests geslaagd, 2 overgeslagen. Eén niet-blokkerende melding over een overbodige eslint-disable.
- Geïsoleerde MariaDB-ketentest: 8 tests geslaagd; alle externe calls gemockt. Exportherhaling, verloren response, concurrentie, bronimport, bevestiging, DNC/verlopen token en verzendstatus gecontroleerd.
- Zoeken: 7 tests geslaagd, inclusief volledige transcriptie en deduplicatie van tracking.
- Productiebouw en GitHub-uitrol geslaagd: platform image/revision `efc22171b422ba038017db772c3cd6f7e137dfd5`.
- Childtheme vanaf server gecommit en gepusht: `ee361a3` (inclusief metadata-, rangschikkings- en toegankelijkheidsherstel).
- Additieve Prisma-migratie `202609200001_faq_newsletter` succesvol toegepast.
- Live: bevestigingspagina HTTP 200, CORS OPTIONS 204, beschermd redactiescherm zonder sessie 307 naar login. FAQ REST retourneert 19 gepubliceerde records met nieuwsbriefdata. Dashboard API en alle synchronisatietaken HTTP 200/succes.
- Live browser: bedenktijd levert één vraag op; combinatie Taxatie levert nul; wissen herstelt 19; antwoord openen/terug behoudt de zoekopdracht. Nieuwsbriefvormgeving en footer mobiel opnieuw bekeken na cacheverversing.
- Matomo API werkt voor zoektermen en nulresultaten via afzonderlijke events. De historische FAQ-zoekrapportage was leeg voor ingebruikname; geen historische zoekopdrachten gereconstrueerd.
- Testdatabase, beperkte QA-gebruiker, SSH-tunnel, lokale testservers en tijdelijke lokale QA-credentials zijn opgeruimd. Geen productiecontacten als testdata gebruikt; geen nieuwsbrief naar abonnees verzonden.

## Backups en herstel

- Platform: `/home/DeVreeMakelaardij/stacks/devree-platform/backups/faq-newsletter-20260920-163417/` — nieuwsbriefgegevens/migratieadministratie en configuratie vóór de wijziging.
- WordPress: `/home/DeVreeMakelaardij/backups/faq-newsletter-20260920/` — themabestanden en postmeta van de 19 vragen.
- Operationele instructies: `devree-faq-newsletter/scripts/newsletter/README.md`.
- Aanmelding pauzeren: `NEWSLETTER_SIGNUP_ENABLED=false` in bestaande serverconfiguratie en uitsluitend platform herstarten. Timers kunnen afzonderlijk gestopt worden. Schema is additief; rollback vereist geen verwijderen van nieuwe inschrijvingen.

## Nog open

Eén echte bezorgtest naar een door Melvin aangewezen eigen e-mailadres, inclusief ontvangen bevestigingsmail en segmentlidmaatschap. Hiervoor is nog geen adres opgegeven. De eerste nieuwsbrief is bewust niet goedgekeurd of verstuurd.

## Aanvullende kritische controle

| Onderdeel | Resultaat en bewijs |
| --- | --- |
| Zoekrelevantie | VvE met vraagteken en vereniging van eigenaren werken; directe VvE-uitleg staat boven MJOP en toevallige transcriptietreffers. Titel weegt het zwaarst. Alleen typen telt niet als uitgevoerde zoekactie. |
| Meting werkelijk ontvangen | Browser → echte Matomo-JavaScript → bestaande WP-proxy → geïsoleerde QA-site → verwerkte Matomo-rapportage gecontroleerd. Twee testrondes geven vier zoekacties; dubbel klikken voegt niets toe. Een test-e-mailadres werd niet gelogd. |
| Nulresultaten | Het standaard Matomo-rapport laat termen weg die ook positieve resultaten hebben (geïnstalleerde Actions-code gebruikt MAX(search_count)). Daarom krijgt iedere nulresultaatactie een eigen event. Tweede ronde: één nulresultaat-event; de platformparser leest exact één, naast twee zoekacties. Dit voorkomt onderschatting van gemiste antwoorden. Geen reconstructie van eerdere nulresultaten. |
| Testverkeer | De tijdelijke QA-site 3 stond los van zakelijke site 1 en is na het bewaren van meetbewijs verwijderd. Een gecontroleerde interne relay was nodig vanwege bestaande IP-uitsluitingen. Die uitsluitingen zijn behouden. Het bewijs betreft de gecontroleerde keten, niet registratie door iedere browser. |
| Mobiel | Visueel opnieuw bekeken op smal scherm; zoekveld, knoppen, nieuwsbrief en footer hebben marges. Gemeten documentbreedte gelijk aan viewport, geen horizontale overflow. Eén nieuwsbriefformulier en één main-landmark. |
| Toetsenbord | Enter zoekt; wissen herstelt alle 19 kaarten en focus op zoekveld. Leeg nieuwsbriefadres wordt afgewezen en krijgt focus. Zoek-/filterstatus is beschikbaar voor ondersteunende technologie. Geen volledige WCAG-audit geclaimd. |
| HTML zonder JavaScript | Alle 19 kaarten en gewone artikel-links staan al in de serverrespons. Zoekbediening is progressieve verrijking. |
| SEO | Alle 19 artikel-URL’s HTTP 200, één H1, één meta description en eigen canonical. Archief heeft één H1, één description en één main. Robots.txt blokkeert niet; sitemap bevat archief en alle 19 artikelen; alle sitemap-pagina’s zijn rechtstreeks gelinkt. Zoektermen veranderen de URL niet. |
| Bevestigingspagina | `noindex, nofollow` live aanwezig op de publieke nieuwsbriefbevestigingspagina. |
| Publicatie en cache | Index wordt op iedere ongecachete archiefrequest uit uitsluitend gepubliceerde FAQ’s opgebouwd. Bestaande Nginx-paginacache is maximaal tien minuten; wijzigingen kunnen daardoor maximaal tien minuten later zichtbaar zijn. Assets gebruiken filemtime-versies. Voor deze release is alleen de archiefcache gericht ververst. |
| Omvang | Zoekindex circa 79 kB ongecomprimeerd voor 19 vragen. Lokale zoekproeven circa 2–21 ms; dit is geen mobiele Core Web Vitals-meting. |

De technische SEO-basis is op orde. Dit is geen bewijs van betere posities of volledige inhoudelijke actualiteit van alle bestaande antwoorden. De site behoudt de afzonderlijke inhoudelijke artikelpagina’s. Voor FAQ-rich-results doet deze implementatie geen belofte; Google beperkt die presentatie tot gezaghebbende overheids- en gezondheidssites (https://developers.google.com/search/blog/2023/08/howto-faq-changes).

Praktisch gebruik: bekijk in het nieuwsbriefscherm de zoektermen en nulresultaten; controleer eerst filter/synoniem, koppel daarna een bestaand antwoord of plan nieuwe uitleg. De dagelijkse import gebruikt volledige dagen, dus zoekacties van vandaag verschijnen vanaf de volgende verwerking. Beoordeel na vier tot zes weken de absolute aantallen. De maandtimer maakt een concept; goedkeuren, exporteren en verzenden blijven afzonderlijke stappen.

Laatste productiecontrole: GitHub-run 35519045318 geslaagd; draaiende container `efc22171b422ba038017db772c3cd6f7e137dfd5`. De dagelijkse service is opnieuw uitgevoerd: FAQ-import 19, Matomo huidige/vorige periode succesvol, verzendstatuscontrole succesvol (0 geëxporteerde edities). Childtheme `ee361a3` staat op GitHub en de publieke JavaScript bevat de nulresultaatmeting.
