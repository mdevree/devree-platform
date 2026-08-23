# Persoonlijke afspraakbevestigingen

Gebruik dit voor bezichtigingen waarbij u vooraf een persoonlijke WhatsApp-bevestiging met video wilt sturen.

## Werkwijze

1. Open het platform en ga naar **Agenda**.
2. Open de betreffende bezichtiging.
3. Klik in het blok **Persoonlijke bevestiging** op **Bevestiging maken**.
4. Upload een korte MP4-video.
5. Open **Preview** en controleer de pagina, video, afspraakgegevens en woninglink.
6. Klik op **WhatsApp sturen**.

De kandidaat ontvangt een link zoals:

```text
https://www.devreemakelaardij.nl/afspraak/<token>
```

De WordPress-site stuurt deze link door naar de publieke platformpagina.

## Wat de kandidaat ziet

- De persoonlijke video.
- De bezichtigingsdatum en het woningadres.
- De tekst dat er ongeveer 30 minuten wordt gereserveerd.
- De knop **Ik ben erbij**.
- De knop **Afspraak annuleren**.
- De knop **Bekijk de woning op onze website** naar de specifieke woningpagina.

## Tracking

Het platform registreert:

- pagina geopend
- video gestart
- video grotendeels bekeken
- video volledig bekeken
- bevestigd
- annulering aangevraagd
- woningpagina aangeklikt

Deze signalen worden lokaal opgeslagen en waar mogelijk als Mautic-activiteit, punten en tags toegevoegd aan het gekoppelde contact.
