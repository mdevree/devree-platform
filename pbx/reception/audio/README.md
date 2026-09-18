# PBX-bandjes

`main.mp3` is het door Melvin aangeleverde, goedgekeurde ElevenLabs-bestand.
`main.wav` is daarvan de telefoonversie: PCM16, mono, 8 kHz.
Stem: Marianne - Senior Dutch voice. Model: Eleven Multilingual v2.
Speed 1, stability 0.5, similarity 0.75, style 0, speaker boost aan.

Alle teksten staan in `../prompts.json`. Aanvullende bestanden krijgen exact de
sleutelnaam met `.mp3` (bron) en `.wav` (Asterisk). De heartbeat controleert dat
alle 13 WAV-bestanden aanwezig zijn. Geen runtime-TTS of AI nodig.
