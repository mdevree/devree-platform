# Contract: ContactV1

Laatst bijgewerkt: 2026-07-21.

Dit contract beschrijft het canonieke contactformaat tussen Mautic, het
kantoorplatform en het debiteurensysteem. Het voorkomt dat Mautic-adresvelden
zoals `address1` en `address2` rechtstreeks op verkeerde debiteurenvelden
terechtkomen.

## Richting

Mautic -> platform normalisatie -> debiteurensysteem.

Het platform is verantwoordelijk voor ophalen en normaliseren. Het
debiteurensysteem valideert het contract opnieuw voordat een klant wordt
aangemaakt of gekoppeld.

## Identificatie

| Veld | Gebruik |
| --- | --- |
| `contractVersion` | Altijd `ContactV1` |
| `source` | Altijd `mautic` voor dit contract |
| `mauticContactId` | Primaire externe identiteit |
| `email`, `mobiel`, `telefoon` | Alleen fallback voor matching als Mautic-ID ontbreekt in bestaande data |

## Payloadvelden

| Veld | Type | Opmerking |
| --- | --- | --- |
| `aanhef` | string/null | Facturatieaanhef, bijvoorbeeld `De heer` |
| `initialen` | string/null | Initialen voor factuuradres |
| `voornamen`, `voornaam` | string/null | Ruwe en korte naamdelen uit Mautic |
| `tussenvoegsel` | string/null | Apart veld, niet in achternaam samenvoegen |
| `achternaam` | string | Verplicht voor klant-upsert |
| `straat` | string/null | Zonder huisnummer |
| `huisnummer` | string/null | Apart veld; mag letters of streep bevatten |
| `toevoeging` | string/null | Bijvoorbeeld `A`, `bis` of `-1` |
| `aanvullendeAdresregel` | string/null | Alleen echte extra adresregel, geen duplicaat van postcode/plaats |
| `postcode`, `plaats`, `land` | string/null | Postcode blijft landafhankelijk |
| `partner` | object/null | Partnercontact, niet stil samenvoegen |
| `normalizationWarnings` | array | Twijfel expliciet melden, niet raden |

## Mautic bronvelden

Het platform geeft ruwe Mautic-waarden aan de normalisatiefunctie door. De
actuele facturatie-aliassen in Mautic zijn:

| Mautic alias | ContactV1 veld |
| --- | --- |
| `id` | `mauticContactId` |
| `firstname` | `voornaam`, `voornamen`, fallback voor `initialen` |
| `lastname` | `tussenvoegsel`, `achternaam` |
| `email` | `email` |
| `mobile` | `mobiel` |
| `phone` | `telefoon` |
| `address1` | `straat`, fallback parse voor `huisnummer` en `toevoeging` |
| `address2` | `aanvullendeAdresregel`, behalve bij duplicaat postcode/plaats |
| `zipcode` | `postcode` |
| `city` | `plaats` |
| `country` | `land` |
| `huisnummer` | `huisnummer` |
| `huisnummer_toevoeging` | `toevoeging` |
| `otd_aanhef` | `aanhef` |
| `otd_initialen` | `initialen` |
| `otd_voornamen` | `voornamen` |

## Voorbeelden

De versieerbare voorbeeldpayloads staan in
`src/lib/contracts/contactV1.examples.json` en dekken:

- volledig contact;
- ontbrekend huisnummer;
- samengesteld `address1`;
- buitenlandse postcode;
- partnercontact.

## Foutgedrag

- Ontbrekende `achternaam` of ongeldig `mauticContactId`: request weigeren met
  validatiefout.
- Meerdere mogelijke bestaande klanten: geen klant aanmaken, maar
  `review_required` teruggeven.
- Onzekere adresparsing: waarde bewaren in het best passende veld en een
  `normalizationWarnings` item toevoegen.
- Bij Mautic -> debiteuren koppelen toont het platform deze warnings direct in
  de facturatiekaart, zodat kantoor het adres kan controleren voordat het verder
  factureert.
