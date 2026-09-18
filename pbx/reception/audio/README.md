# PBX-bandjes

`main.mp3` is het door Melvin aangeleverde, goedgekeurde ElevenLabs-bestand.
`main.wav` is daarvan de telefoonversie: PCM16, mono, 8 kHz.
Stem: Marianne - Senior Dutch voice. Model: Eleven Multilingual v2.
Speed 1, stability 0.5, similarity 0.75, style 0, speaker boost aan.

Alle teksten staan in `../prompts.json`. Aanvullende bestanden krijgen exact de
sleutelnaam met `.mp3` (bron) en `.wav` (Asterisk). De heartbeat controleert dat
alle 13 WAV-bestanden aanwezig zijn. Geen runtime-TTS of AI nodig.

`additional-source.mp3` bevat elf aanvullende teksten met tien expliciete
pauzes van drie seconden. `segments.json` legt de gecontroleerde knippunten,
teksten en SHA-256 van ieder WAV-bestand vast. Reproduceren:
`python3 scripts/pbx/split-audio.py`. Het script weigert te splitsen als het
aantal gevonden pauzes niet klopt. De aangeleverde teksten en instellingen
zijn via de ElevenLabs-webinterface gebruikt; geen API-sleutel nodig.

De formaten, duur en pauzes zijn technisch gecontroleerd. Hoorbaarheid en
uitspraak via een echt telefoontoestel horen bij de praktijktest.
