# Woning aanmelden en websitevelden beheren

Deze werkwijze is bedoeld voor baliemedewerkers die tijdens Melvins vakantie woningen op de website moeten plaatsen of aanpassen.

## Kortste route

Ja: plak de Realworks JSON uit de e-mail gewoon in het kantoorplatform.

Ga naar:

```text
Kantoorplatform -> Projecten -> open verkoopproject -> tab Woning
```

Gebruik daar de sectie `Website aanmelding`.

## Nieuwe woning plaatsen

1. Maak of controleer het verkoopproject in het kantoorplatform.
2. Vul minimaal het Realworks ID in bij `Project bewerken`.
3. Open de tab `Woning`.
4. Plak de volledige Realworks JSON uit de e-mail in `Realworks JSON uit e-mail plakken`.
5. Klik `Inlezen in velden`.
6. Controleer de ingevulde velden en pas aan waar nodig.
7. Klik `JSON kopieren`.
8. Mail de gekopieerde JSON naar `workflow@devreemakelaardij.nl`.
9. Open n8n en start de woning-aanmeldworkflow:

```text
https://automation.devreemakelaardij.nl/workflow/AyzR4DQEG3wF-Vu4po2Ed
```

10. Controleer daarna in het platform opnieuw de tab `Woning`.
11. Zodra de woning gevonden wordt, kunnen velden voortaan direct via `Opslaan op website` worden aangepast.

## Bestaande woning aanpassen

1. Open het verkoopproject.
2. Ga naar de tab `Woning`.
3. Plak eventueel opnieuw de Realworks JSON en klik `Inlezen in velden`.
4. Pas de gewenste velden aan.
5. Klik `Opslaan op website`.
6. Klik `Bekijk op website` om te controleren.

## AI-velden aanvullen

De workflow `Wordpress ai woningen aanvullen` vult lege AI-tekstvelden aan voor bestaande WordPress-woningen:

```text
https://automation.devreemakelaardij.nl/workflow/aKZc4pkTcoTH-cpkOpFNl
```

Gebruik deze workflow nadat een woning in WordPress staat en er een aanbiedingstekst is ingevuld. Daarna kunnen de gegenereerde velden in het kantoorplatform worden nagekeken en aangepast.

Belangrijk: de AI-workflow overschrijft alleen lege AI-velden. Als een baliemedewerker zelf tekst in het platform invult en opslaat, blijft die tekst leidend.

## Foto's

De geplakte Realworks JSON bevat `media` met foto-links. Het platform haalt die links eruit en zet ze in `Foto-URL's voor workflow`.

De platformknop `Opslaan op website` wijzigt tekstvelden, kenmerken en media-links, maar uploadt geen nieuwe fotobestanden. Voor nieuwe woningen blijven de foto’s daarom via de bestaande n8n-workflow lopen.

## Controlelijst voor publicatie

- Realworks ID klopt.
- Titel, slug en publicatiestatus kloppen.
- Website-status staat goed, meestal `Beschikbaar`.
- Prijs en prijslabel zijn gecontroleerd.
- Adres, postcode en plaats zijn volledig.
- Woonoppervlakte, perceel, inhoud, kamers, bouwjaar en energielabel zijn ingevuld.
- Aanbiedingstekst en AI-teksten zijn nagelezen.
- Floorplanner, 360-tour en video werken.
- Foto's staan zichtbaar op de website.
- De websitepagina is geopend en visueel gecontroleerd.
