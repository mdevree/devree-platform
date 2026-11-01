# Publicatiearchief per project

De projecttab Social media gebruikt opgeslagen Postiz-publicaties. Kanaalstatistieken blijven apart.

## Bronnen en synchronisatie

`scripts/social-publications-sync.py` leest met de bestaande marketingconfig de Postiz API. De lokale Postiz-database wordt uitsluitend in een READ ONLY-transactie gelezen voor media, berichttype, verwijderingen en het uitsluiten van reacties. Alleen records van API-geautoriseerde kanalen worden gebruikt. WordPress levert de woninglink/Realworks-code; `/opt/devree-social-week*/catalog.json` levert de koppeling via postId/source. De optionele `.config/social-publication-catalog.json` bevat expliciete aanvullende mappings per Postiz-ID (`realworksId`, `sourceUrl`). Nooit credentials in deze catalogus.

Nieuwe campagnes: blijf het definitieve Postiz-ID en de exacte woninglink (`source`) in de servercatalogus opnemen; voeg waar beschikbaar `realworksId` toe. De viermaal-daagse collector pakt nieuwe weekmappen automatisch op. Berichten zonder eenduidige bron belanden in Nog koppelen; handmatige correcties worden gelockt.

Installatie: additieve migratie via bestaande entrypoint, vooraf databaseback-up. Kopieer de collector naar de bestaande `.local/bin` en de systemd-unit/timer naar `/etc/systemd/system/`. Eerst `--dry-run`, dan echte import, daarna tweede import voor idempotentiecontrole; pas dan timer activeren. De service draait op de host wegens de bestaande lokale Postiz-container en WP-CLI. De API-sleutel blijft server-side in de bestaande 0600-marketingconfig.

## Bewijs en grenzen

Telling vereist Postiz PUBLISHED plus releaseId/link, of handmatig opgegeven plaatsing plus link/JPG/PNG. Screenshots zitten als afgeschermde blobs in de platformdatabase; geen publiek uploadpad. Een link of handmatig bewijs is geen onafhankelijke verificatie door Meta. Datumbron wordt getoond: publishDate uit Postiz bewijst geen exacte livegang. Ontbrekende API-records worden nooit stilzwijgend gewist. Aantoonbaar gepubliceerde records blijven als historische plaatsing tellen. Een soft-delete in Postiz is alleen een verwijderd bronrecord en bewijst geen verwijdering op Facebook/Instagram; die twee statussen blijven apart.

Eén bericht per kanaal/externe publicatie-ID; reacties worden uitgesloten, carrousels tellen eenmaal, story-onderdelen afzonderlijk. Verschillende kanalen zijn verschillende plaatsingen. Bij herpublicatie met een nieuw extern ID blijft de vorige registratie bewaard. Bij projectmerge gaan koppelingen mee. Algemene kantoorposts kunnen worden uitgesloten.

Rapport: browser afdrukken/opslaan als PDF, alleen bevestigde publicaties, huidige filters, bron/datumbeperkingen en moment van laatste volledige sync. Geen openbare klantlink. Afbeeldingsvoorbeelden uit Postiz kunnen verdwijnen; tekst en registratie blijven bewaard, screenshots zijn duurzaam opgeslagen. Geen automatisch bewijs van unieke kijkers of aanvragen.

Rollback: nieuwe timer stoppen, vorige platformimage terugzetten; additieve tabellen met bewijs bewaren. De bestaande marketingtimer hoeft niet te worden gewijzigd.
