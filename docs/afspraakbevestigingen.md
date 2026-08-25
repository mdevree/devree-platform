# Persoonlijke afspraakbevestigingen

Gebruik dit voor bezichtigingen waarbij u vooraf via WhatsApp een persoonlijke bevestiging met video wilt sturen. De pagina is bedoeld om vertrouwen op te bouwen, vragen laagdrempelig te maken en tijdige annuleringen te stimuleren.

## Werkwijze

1. Open het kantoorplatform en ga naar **Agenda**.
2. Open de betreffende bezichtiging.
3. Klik bij **Persoonlijke bevestiging** op **Bevestiging maken**.
4. Upload de originele MP4- of MOV-video van maximaal 80 MB. MOV wordt automatisch naar een webvriendelijke MP4 omgezet. HDR-video's van bijvoorbeeld een iPhone worden daarbij naar normale webkleuren omgezet. Horizontale en verticale video's worden automatisch in de juiste verhouding getoond.
5. Klik op **Preview** en controleer de video, afspraakgegevens, woninglink en contactgegevens.
6. Klik op **WhatsApp-concept maken** wanneer alles klopt.
7. Open het concept in de **Digitale medewerker**, pas de tekst zo nodig aan, keur hem goed en verzend hem daar.

De klant ontvangt een persoonlijke link zoals:

```text
https://www.devreemakelaardij.nl/afspraak/<token>
```

De link opent een echte WordPress-pagina met de normale menubalk, websitevormgeving en footer.

## Preview

- De knop **Preview** maakt bij iedere klik een nieuwe tijdelijke previewlink.
- Een preview is acht uur geldig en bevat geen tracking.
- Annuleren of andere afspraakacties worden vanuit een geldige preview niet opgeslagen.
- Een verlopen of ongeldige preview toont alleen een melding en wordt nooit als actieve klantpagina geopend.
- Gebruik daarom altijd de knop **Preview** in het kantoorplatform en bewaar een oude previewlink niet als vaste controlelink.

## Wat de klant ziet

- De persoonlijke video.
- De bezichtigingsdatum, het woningadres en de naam van de makelaar.
- Een link naar de specifieke woningpagina op de website.
- Het telefoonnummer en e-mailadres voor vragen vooraf.
- Een rustige knop om de afspraak te annuleren.
- Na annuleren de bevestiging dat dit is ontvangen, met het telefoonnummer voor het maken van een nieuwe afspraak.
- Onderaan een subtiele link naar de veelgestelde vragen.

Er is bewust geen knop **Ik ben erbij**. Het openen van de pagina en bekijken van de video geven een bruikbaarder signaal dan een extra bevestigingshandeling.

## Annuleringen

Bij annuleren:

- verandert de afspraakbevestiging in het platform naar `cancel_requested`;
- ontvangt `info@devreemakelaardij.nl` automatisch een e-mail;
- worden het annuleringssignaal en de bijbehorende Mautic-tag vastgelegd;
- ziet de klant het verzoek om voor een nieuwe afspraak te bellen met 0181 - 611 919.

Ook een afspraak die eerder via de oude bevestigingsknop is bevestigd, kan nog worden geannuleerd.

## Tracking en Mautic

Het platform registreert buiten de preview:

- pagina geopend;
- video gestart;
- video voor 25% en 75% bekeken;
- video volledig bekeken;
- annulering aangevraagd;
- specifieke woningpagina aangeklikt.

Deze signalen worden lokaal opgeslagen en waar mogelijk als Mautic-activiteit, punten en tags aan het gekoppelde contact toegevoegd. De preview telt niet mee.
