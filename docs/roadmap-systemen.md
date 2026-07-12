# Roadmap systemen en efficientie

Laatst bijgewerkt: 2026-07-12.

Doel: de bestaande systemen betrouwbaarder, beter beheerbaar en efficienter
maken zonder eerst nieuwe grote features toe te voegen.

## Uitgangspunten

- Het kantoorplatform draait live vanuit GitHub/GHCR.
- De hele stack is breder dan het platform: n8n, PBX, WordPress, Mautic,
  Documenso, WhatsApp, Realworks-extensie en debiteurenadministratie horen bij de
  productie-operatie.
- Eerst reproduceerbaarheid en observability verbeteren, daarna verdere
  automatisering.
- Geen automatische klantacties zonder menselijke controle waar dat juridisch of
  klantgevoelig is, zoals OTD/Documenso en AI-belacties.

## Fase 1: bron van waarheid en controle

Resultaat: per systeem is duidelijk wat productie is, welke bron leidend is en
hoe je veilig controleert of het werkt.

Acties:

1. Werk `docs/systemen-overzicht.md` bij na iedere systeemwijziging.
2. Controleer lokale kopieen zonder Git-repo op unieke wijzigingen:
   - `DeVreeMakelaardij-marketobjects`
   - `devree-platform-dashboard-work2`
   - `devree-platform-dashboard-work`
   - `devree-realworks-browserext`
   - `DeVreePBX`
3. Verwerk de 12 lokale wijzigingen in de productie child theme checkout:
   - reviewen;
   - committen/pushen als ze bewust zijn;
   - anders documenteren waarom ze lokaal blijven.
4. Zorg dat de lokale platformrepo weer met GitHub kan praten via SSH, zodat
   `git fetch` en `git ls-remote` werken.
5. Leg per productiecontainer vast of `latest` acceptabel is of dat een vaste
   versie/tag nodig is.

Acceptatiecriteria:

- Er is geen twijfel welke repo of map leidend is voor platform, child theme,
  n8n exports, PBX bridge en debiteuren.
- Elke lokale kopie is gelabeld als productiebron, werkmap, archiveerbaar of
  nader te controleren.
- Live platform revision is zichtbaar in documentatie en systeemcontrole.

## Fase 2: CI, tests en deployzekerheid

Resultaat: een push naar `main` wordt pas live als de belangrijkste checks
groen zijn.

Acties:

1. Breid GitHub Actions uit met:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - daarna pas Docker build en deploy.
2. Voeg fixture-tests toe voor Realworks payloads:
   - relatie/contact;
   - agenda;
   - woning/object;
   - kadaster;
   - lead response/kijker;
   - mutatielijst/kansen.
3. Voeg regressietests toe voor de OTD/voorstel-flow:
   - proposal-link;
   - preview zonder tracking;
   - view/event tracking;
   - akkoordmail;
   - remarks-mail;
   - Documenso concept zonder directe klantredirect.
4. Maak een korte deployrunbook:
   - build;
   - image tag;
   - server deployscript;
   - healthcheck;
   - rollback;
   - loglocaties.

Acceptatiecriteria:

- GitHub Actions faalt voor lint/typecheck/testfouten.
- Productiedeploy blijft rollbacken als de healthcheck faalt.
- Minstens de klantgevoelige OTD-flow heeft regressietests.

## Fase 3: systeemcontrole als cockpit

Resultaat: `/systeemcontrole` toont niet alleen Realworks-sync, maar de status
van alle kritieke ketens.

Acties:

1. Voeg platform build metadata toe:
   - commit-SHA;
   - buildtijd;
   - image tag indien beschikbaar.
2. Breid `/api/system/health/*` uit met checks voor:
   - n8n webhook bereikbaarheid;
   - PBX bridge health;
   - Documenso API;
   - Gotenberg;
   - Mautic OAuth/token;
   - WhatsApp provider;
   - Realworks queue achterstand;
   - laatste succesvolle sync per eventtype.
3. Toon waarschuwingen bij:
   - open quarantaine;
   - oude Realworks-extensieversie;
   - veel failed writes;
   - geen recente agenda-sync;
   - Documenso/n8n/PBX onbereikbaar.
4. Voeg een compact dagelijks statusblok toe voor kantoor:
   - aantal open taken/fouten;
   - welke keten aandacht nodig heeft;
   - link naar relevante log/details.

Acceptatiecriteria:

- Een medewerker ziet op een pagina of de belangrijkste automatiseringen gezond
  zijn.
- Fouten zijn traceerbaar naar systeem, workflow, eventtype en laatste payload.

## Fase 4: integratiecontracten en traceerbaarheid

Resultaat: Realworks, n8n, platform, Mautic, WhatsApp en PBX gebruiken duidelijke
payloadcontracten en gedeelde trace-id's.

Acties:

1. Maak `docs/contracts/` met contracten voor:
   - Realworks contact sync;
   - Realworks agenda sync;
   - Realworks woning sync;
   - Realworks kadaster sync;
   - Realworks lead response;
   - AI caller start;
   - AI caller result;
   - WhatsApp webhook;
   - Documenso webhook;
   - debiteuren API.
2. Valideer inkomende platformpayloads met schemas.
3. Laat de Realworks-extensie altijd meesturen:
   - `extensionVersion`;
   - `traceId`;
   - `eventType`;
   - `sourceHost`;
   - relevante object/contact sleutel.
4. Laat n8n dezelfde `traceId` doorgeven naar Mautic/platform/PBX.
5. Bewaar per keten de laatste foutcategorie en herstelactie.

Acceptatiecriteria:

- Een fout in Realworks -> n8n -> platform -> Mautic is met een trace-id te
  volgen.
- Onbekende of incomplete payloads komen in quarantaine, niet stil in productie.

## Fase 5: Realworks-extensie robuuster maken

Resultaat: minder stille syncproblemen en minder afhankelijkheid van handmatige
kennis.

Acties:

1. README corrigeren: secretbeheer via options-pagina, niet handmatig in code.
2. Versie tonen in options-pagina en meesturen bij ieder event.
3. Schrijftaken uitbreiden met:
   - retry-knop;
   - duidelijke foutcategorie;
   - verlopen formuliercache detectie;
   - melding als record eerst geopend/opgeslagen moet worden.
4. Backup/discovery captures voorzien van retentie en scherpere filters.
5. Periodiek rapporteren:
   - hoeveel events verwerkt;
   - hoeveel genegeerd;
   - hoeveel quarantaine;
   - welke Realworks schermen nog onbekend zijn.

Acceptatiecriteria:

- Kantoor kan zien waarom een Realworks-terugschrijftaak niet lukt.
- Nieuwe Realworks payloadvarianten worden veilig ontdekt zonder de database te
  vervuilen.

## Fase 6: AI-belassistent productie-afronding

Resultaat: AI-belkaarten kunnen gecontroleerd, traceerbaar en betrouwbaar live
worden gebruikt.

Acties:

1. PBX VPS upgraden naar minimaal 2 GB RAM, bij voorkeur 4 GB.
2. Hardcoded testcontext uit actieve AI-context verwijderen.
3. Belkaartcontext volledig dynamisch maken vanuit platformpayload.
4. Live test met korte greeting opnieuw uitvoeren:
   - audio start direct;
   - klantturns komen in transcript;
   - barge-in werkt;
   - samenvatting klopt;
   - AI hangt zelf op;
   - resultaat komt terug in platform;
   - info-mail wordt verstuurd.
5. Heuristische transcript-parser vervangen door schema-extractie:
   - klantvragen;
   - interesse;
   - twijfels;
   - gevraagde opvolging;
   - voorgestelde toegestane links.
6. In systeemcontrole PBX bridge en laatste callresultaat tonen.

Acceptatiecriteria:

- Geen belactie start zonder menselijke `BEL`-goedkeuring.
- Elk gesprek heeft outcome, duur, transcript, samenvatting, klantvragen en
  opvolgstatus.
- Mislukte audio of stilte wordt expliciet als fout geregistreerd.

## Fase 7: kantoorprocessen versnellen

Resultaat: medewerkers krijgen minder handwerk en betere prioriteiten.

Acties:

1. Kansen prioriteren op basis van:
   - Realworks mutaties;
   - Mautic activiteit;
   - zoekprofielen;
   - agenda/bezichtigingen;
   - open opvolging.
2. Conceptopvolging centraal maken:
   - WhatsApp;
   - e-mail;
   - belkaart;
   - taak.
3. Taken en projecten nauwer koppelen:
   - verkoopproject;
   - aankoopproject;
   - taxatie;
   - OTD/voorstelstatus;
   - tijdregistratie.
4. Dagelijkse kantoorbrief:
   - wat moet vandaag opgevolgd worden;
   - welke kansen zijn warm;
   - welke automatiseringen hebben aandacht nodig;
   - welke klantflows wachten op akkoord/controle.

Acceptatiecriteria:

- Medewerker hoeft niet in meerdere systemen te zoeken naar "wat moet nu".
- Iedere kans of klantactie heeft een eigenaar, status en volgende stap.

## Eerste concrete backlog

1. `git fetch`/GitHub SSH voor platformrepo herstellen.
2. Lokale platformwijzigingen reviewen en logisch opsplitsen.
3. Productie child theme wijzigingen inspecteren en naar Git brengen.
4. GitHub Actions uitbreiden met lint/typecheck/test voor deploy.
5. `/systeemcontrole` uitbreiden met build metadata en PBX bridge health.
6. Realworks-extensie README en versiebeheer corrigeren.
7. Contractbestand maken voor AI caller start/result.
8. Contractbestand maken voor Realworks woning/kadaster payloads.
9. PBX VPS capaciteit verhogen en live audio hertesten.
10. n8n workflow exports en productie-activeringsstatus periodiek vastleggen.
