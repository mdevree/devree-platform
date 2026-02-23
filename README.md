# De Vree Makelaardij — Kantoor Platform

Centraal kantoor platform dat alle systemen van De Vree Makelaardij met elkaar verbindt.

## Modules

- **Dashboard** — Tijdsgebonden begroeting, overzicht van openstaande taken en recente activiteit
- **Telefonie** — Live call popups, call history, Mautic CRM koppeling, notities per gesprek, contact detail panel met AI data profiel
- **Taken** — Kanban + tabeloverzicht, per makelaar en centraal voor binnendienst, met tijdregistratie per taak
- **Projecten** — Woningdossiers (Verkoop / Aankoop / Taxatie) gekoppeld aan taken, gesprekken, Mautic contacten en Notion. Bevat dossier tab met commerciële gegevens, kadastrale info en kosten. Projecten kunnen worden samengevoegd
- **Contacten** — Mautic CRM overzicht met zoekfunctie, contactdetails bewerken, AI data profiel en email activiteit. Nieuw contact aanmaken direct vanuit de pagina
- **Pipeline** — Kanban-board op basis van `verkoopgesprek_status` uit Mautic, met interesse-scores en AI profielen
- **Buurtdata** — Opzoeken van wijkdata op basis van postcode + huisnummer via n8n. Genereert een printbaar rapport met: BAG-gegevens, leefbaarheidsscore, bevolkingssamenstelling, huishoudens, woningmarkt, inkomen, bereikbaarheid, klimaat, geluidsbelasting en luchtkwaliteit
- **Tijdregistratie** — Timer per taak (start/pauze/stop) + handmatig tijd toevoegen, logboek van sessies, beschikbaar via API
- **Mautic** — CRM contacten opzoeken, aanmaken en bijwerken (inclusief AI data profiel en email activiteit)
- **Notion** — Bidirectionele sync via n8n webhooks

## Tech Stack

Next.js · TypeScript · Tailwind CSS · Prisma · MySQL · NextAuth.js · Docker

---

## API Overzicht

Alle endpoints accepteren twee authenticatiemethoden:

1. **Sessie-cookie** — standaard voor gebruik vanuit de browser (NextAuth)
2. **`x-webhook-secret` header** — voor server-to-server aanroepen (n8n, externe systemen)

```
x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

Webhooks (POST naar `/webhook`) gebruiken uitsluitend de `x-webhook-secret` header.

---

### Authenticatie

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET / POST` | `/api/auth/[...nextauth]` | NextAuth.js sessie afhandeling (login, logout, session check) |

---

### Taken `/api/taken`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/taken` | Haal taken op met filters en paginering |
| `POST` | `/api/taken` | Maak een nieuwe taak aan |
| `PATCH` | `/api/taken` | Werk een bestaande taak bij |
| `DELETE` | `/api/taken` | Verwijder een taak |
| `POST` | `/api/taken/webhook` | Verwerk taken van n8n / Notion sync |

#### `GET /api/taken` — Query parameters

| Parameter | Type | Omschrijving |
|-----------|------|--------------|
| `status` | `string` | Filter op status. Meerdere mogelijk: `open,bezig,afgerond` |
| `priority` | `string` | Filter op prioriteit. Meerdere mogelijk: `laag,normaal,hoog,urgent` |
| `category` | `string` | Filter op categorie: `binnendienst`, `verkoop`, `aankoop`, `taxatie`, `administratie` |
| `assigneeId` | `string` | Filter op toegewezen gebruiker (ID) |
| `projectId` | `string` | Filter op project (ID), of `none` voor taken zonder project |
| `search` | `string` | Zoekterm — doorzoekt titel en beschrijving |
| `dueDateFrom` | `ISO 8601` | Taken met deadline op of na deze datum |
| `dueDateTo` | `ISO 8601` | Taken met deadline op of voor deze datum |
| `sortBy` | `string` | Sorteerveld: `status` \| `priority` \| `dueDate` \| `createdAt` \| `completedAt` \| `title` (standaard: `status`) |
| `sortOrder` | `string` | `asc` of `desc` (standaard: `asc`) |
| `page` | `number` | Paginanummer (standaard: `1`) |
| `limit` | `number` | Aantal resultaten per pagina (standaard: `50`, max: `200`) |

**Response:**
```json
{
  "tasks": [...],
  "pagination": { "page": 1, "limit": 50, "total": 120, "pages": 3 }
}
```

Elke taak bevat ook `totalTimeSpent` (seconden) en `timerStartedAt` (null als timer niet loopt).

#### `POST /api/taken` — Body

| Veld | Vereist | Omschrijving |
|------|---------|--------------|
| `title` | ✅ | Taaknaam |
| `assigneeId` | ✅ | ID van de toegewezen gebruiker |
| `description` | | Toelichting |
| `priority` | | `laag` \| `normaal` \| `hoog` \| `urgent` (standaard: `normaal`) |
| `category` | | Categorie |
| `dueDate` | | Deadline (ISO 8601) |
| `projectId` | | Koppelen aan een project |
| `notionPageId` | | Notion pagina ID voor sync |

#### `PATCH /api/taken` — Body

Stuur `id` + de velden die je wilt bijwerken. Bij `status: "afgerond"` wordt `completedAt` automatisch ingesteld.

#### `DELETE /api/taken` — Body

```json
{ "id": "taak-id" }
```

#### `POST /api/taken/webhook` — Notion/n8n sync

Header: `x-webhook-secret`

| Veld | Omschrijving |
|------|--------------|
| `action` | `create` \| `update` \| `delete` |
| `title` | Taaknaam |
| `assigneeEmail` | Wordt omgezet naar gebruiker-ID |
| `projectNotionPageId` | Wordt omgezet naar project-ID |
| `notionPageId` | Gebruikt als unieke sleutel voor upsert |
| `status`, `priority`, `category`, `dueDate`, `description` | Optionele taakvelden |

---

### Tijdregistratie `/api/taken/[id]/timer`

Per taak kan tijd worden bijgehouden via een timer of handmatige invoer. Elke sessie wordt opgeslagen als `TimeEntry`.

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/taken/[id]/timer` | Haal de huidige timerstatus op |
| `POST` | `/api/taken/[id]/timer` | Start, pauzeer of stop de timer |
| `PATCH` | `/api/taken/[id]/timer` | Voeg handmatig tijd toe |
| `DELETE` | `/api/taken/[id]/timer` | Reset alle tijdregistratie voor deze taak |

#### `GET /api/taken/[id]/timer` — Response

```json
{
  "isRunning": true,
  "timerStartedAt": "2025-01-15T09:00:00.000Z",
  "totalTimeSpent": 3600,
  "currentSessionSeconds": 420,
  "totalSeconds": 4020,
  "entries": [
    {
      "id": "...",
      "startedAt": "2025-01-15T08:00:00.000Z",
      "stoppedAt": "2025-01-15T09:00:00.000Z",
      "duration": 3600
    }
  ]
}
```

#### `POST /api/taken/[id]/timer` — Body

```json
{ "action": "start" }
```

| Actie | Omschrijving |
|-------|--------------|
| `start` | Start een nieuwe sessie (fout als timer al loopt) |
| `pause` | Sluit de lopende sessie af en sla de duur op |
| `stop` | Zelfde als pause, bedoeld als definitief stoppen |

#### `PATCH /api/taken/[id]/timer` — Handmatig tijd toevoegen

Gebruik dit als je vergeten bent de timer te starten. Er wordt een `TimeEntry` aangemaakt met de berekende start/stop tijden.

```json
{ "hours": 1, "minutes": 30 }
```

**Response:**
```json
{
  "action": "added",
  "addedSeconds": 5400,
  "totalTimeSpent": 9000
}
```

#### `DELETE /api/taken/[id]/timer`

Reset `totalTimeSpent` naar `0`, verwijdert alle `TimeEntry` records en stopt een eventueel lopende timer.

---

### Projecten `/api/projecten`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/projecten` | Haal projecten op met filters en paginering |
| `POST` | `/api/projecten` | Maak een nieuw project aan |
| `PATCH` | `/api/projecten` | Werk een bestaand project bij |
| `DELETE` | `/api/projecten` | Verwijder een project (ontkoppelt taken en calls eerst) |
| `GET` | `/api/projecten/[id]` | Haal één project op inclusief alle taken, calls en contacten |
| `POST` | `/api/projecten/[id]/contacts` | Koppel een Mautic contact aan een project |
| `DELETE` | `/api/projecten/[id]/contacts` | Ontkoppel een Mautic contact van een project |
| `GET` | `/api/projecten/merge` | Preview van het samenvoegen van twee projecten |
| `POST` | `/api/projecten/merge` | Voeg twee projecten samen (taken, calls en contacten verplaatst naar doelproject) |
| `POST` | `/api/projecten/webhook` | Verwerk projecten van n8n / Notion sync (upsert op `notionPageId`) |

#### `GET /api/projecten` — Query parameters

| Parameter | Type | Omschrijving |
|-----------|------|--------------|
| `type` | `string` | Filter op projecttype: `VERKOOP` \| `AANKOOP` \| `TAXATIE` |
| `statusGroup` | `string` | Filter op statusgroep: `lead` \| `active` \| `terminal` |
| `search` | `string` | Zoekterm — doorzoekt naam, adres, contactnaam en e-mail |
| `page` | `number` | Paginanummer (standaard: `1`) |
| `limit` | `number` | Aantal resultaten per pagina (standaard: `50`) |

**Response:**
```json
{
  "projects": [...],
  "pagination": { "page": 1, "limit": 50, "total": 34, "pages": 1 }
}
```

Elk project bevat:
- `_count.tasks` en `_count.calls` — aantal gekoppelde taken en gesprekken
- `calls` — lijst met calls inclusief `_count.notes` per gesprek
- `contacts` — gekoppelde Mautic contacten (via `ProjectContact`)
- `totalTimeSpent` — som van alle `totalTimeSpent` van gekoppelde taken (in seconden)

#### `POST /api/projecten` — Body

| Veld | Vereist | Omschrijving |
|------|---------|--------------|
| `name` | ✅ | Projectnaam |
| `type` | | `VERKOOP` \| `AANKOOP` \| `TAXATIE` (standaard: `VERKOOP`) |
| `projectStatus` | | Projectstatus conform `STATUS_FLOW` (standaard: `LEAD`) |
| `description` | | Omschrijving |
| `verkoopstart` | | `DIRECT` \| `UITGESTELD` \| `SLAPEND` (alleen bij VERKOOP) |
| `startdatum` | | Beoogde startdatum (bij UITGESTELD) |
| `startReden` | | Reden voor uitstel / slapend |
| `woningAdres` | | Adres van het object |
| `woningPostcode` | | Postcode van het object |
| `woningPlaats` | | Woonplaats van het object |
| `woningOppervlakte` | | Oppervlakte (vrij tekstveld, bijv. `"120 m²"`) |
| `kadGemeente` / `kadSectie` / `kadNummer` | | Kadastrale gegevens |
| `vraagprijs` | | Vraagprijs (VERKOOP) / Aankoopbudget (AANKOOP) / Taxatiewaarde (TAXATIE) in € |
| `courtagePercentage` | | Courtage percentage (bijv. `"1.2"`) |
| `verkoopmethode` | | Verkoopmethode (alleen VERKOOP) |
| `bijzondereAfspraken` | | Vrije tekst voor bijzondere afspraken |
| `kostenPubliciteit` / `kostenEnergielabel` / `kostenJuridisch` / `kostenBouwkundig` / `kostenIntrekking` / `kostenBedenktijd` | | Kostenposten in € (integers, alleen VERKOOP) |
| `contactName` / `contactPhone` / `contactEmail` | | Legacy contactvelden |
| `notionPageId` | | Notion pagina ID voor sync |
| `realworksId` | | Koppelt het project aan de woning op de website via Realworks ID |

#### `POST /api/projecten/[id]/contacts` — Body

```json
{ "mauticContactId": 123, "role": "opdrachtgever" }
```

Upsert — als het contact al gekoppeld is, wordt alleen de `role` bijgewerkt.

#### `DELETE /api/projecten/[id]/contacts` — Body

```json
{ "mauticContactId": 123 }
```

#### `POST /api/projecten/merge` — Body

```json
{ "sourceId": "project-id-1", "targetId": "project-id-2" }
```

Alle taken, calls en contacten van `sourceId` worden verplaatst naar `targetId`. `sourceId` wordt daarna verwijderd.

#### `POST /api/projecten/webhook` — Notion/n8n sync

Header: `x-webhook-secret`

Upsert op basis van `notionPageId`. Vereiste velden: `notionPageId`. Overige velden optioneel (zie POST body hierboven).

---

### Calls `/api/calls`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/calls` | Haal afgeronde calls op met filters en paginering |
| `PATCH` | `/api/calls/[id]/project` | Koppel of ontkoppel een call aan een project |
| `GET` | `/api/calls/[id]/notes` | Haal notities op van een gesprek |
| `POST` | `/api/calls/[id]/notes` | Voeg een notitie toe aan een gesprek (triggert optioneel webhook) |
| `DELETE` | `/api/calls/[id]/notes` | Verwijder een notitie (body: `{ "noteId": "..." }`) |
| `GET` | `/api/calls/stream` | Server-Sent Events (SSE) stream voor live call meldingen |
| `POST` | `/api/calls/webhook` | Verwerk call events van n8n / Voys |

#### `GET /api/calls` — Query parameters

| Parameter | Type | Omschrijving |
|-----------|------|--------------|
| `direction` | `string` | `inbound` of `outbound` |
| `reason` | `string` | Reden van beëindiging (bijv. `completed`, `no-answer`, `busy`, `cancelled`) |
| `projectId` | `string` | Filter op gekoppeld project |
| `search` | `string` | Zoekterm — doorzoekt nummer, naam, contactnaam en bestemmingsnummer |
| `from` | `ISO 8601` | Calls vanaf deze datum |
| `to` | `ISO 8601` | Calls tot en met deze datum |
| `page` | `number` | Paginanummer (standaard: `1`) |
| `limit` | `number` | Aantal resultaten per pagina (standaard: `50`) |

Geeft alleen calls met `status: "ended"` terug.

#### `PATCH /api/calls/[id]/project` — Body

```json
{ "projectId": "project-id" }
```

Stuur `projectId: null` om de koppeling te verwijderen.

#### `POST /api/calls/[id]/notes` — Body

```json
{ "note": "Tekst van de notitie" }
```

Na opslaan wordt optioneel een webhook aangeroepen naar `CALL_NOTE_WEBHOOK_URL` met de volgende payload:

| Veld | Omschrijving |
|------|--------------|
| `noteId` | ID van de nieuwe notitie |
| `callId` | Unieke call-ID van het telefoniesysteem |
| `timestamp` | Tijdstip van het gesprek |
| `direction` | `inbound` of `outbound` |
| `callerNumber` | Beller telefoonnummer |
| `callerName` | Naam van de beller (indien beschikbaar) |
| `destinationNumber` | Bestemmingsnummer |
| `mauticContactId` | Gekoppeld Mautic contact ID |
| `contactName` | Naam van het Mautic contact |
| `projectId` | Gekoppeld project ID |
| `projectName` | Naam van het gekoppelde project |
| `note` | De notitietekst |
| `createdBy` | Naam van de medewerker die de notitie schreef |
| `createdAt` | Tijdstip van aanmaken |

#### `GET /api/calls/stream` — SSE

Geen authenticatie vereist. Verbind met dit endpoint voor real-time call events. Stuurt een heartbeat elke 30 seconden.

Event types: `connected`, `call-ringing`, `call-ended`

#### `POST /api/calls/webhook` — Voys/n8n call events

Header: `x-webhook-secret` (optioneel, afhankelijk van `N8N_WEBHOOK_SECRET` env var)

Verwerkt alle call statussen: `ringing`, `in-progress`, `ended`. Zoekt automatisch het contactnummer op in Mautic. Pusht events naar alle verbonden SSE clients.

---

### Gebruikers `/api/users`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/users` | Haal alle actieve gebruikers op |

**Response:**
```json
{
  "users": [
    { "id": "...", "name": "...", "email": "...", "role": "..." }
  ]
}
```

---

### Mautic `/api/mautic`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/mautic/contact?phone=0612345678` | Zoek een contact op telefoonnummer |
| `GET` | `/api/mautic/contact?id=123` | Haal een contact op via Mautic ID |
| `GET` | `/api/mautic/contact?id=123&full=1` | Haal volledig contact op (adres, tags, AI profiel) |
| `POST` | `/api/mautic/contact` | Maak een nieuw contact aan in Mautic |
| `PATCH` | `/api/mautic/contact` | Werk contact velden bij in Mautic |
| `GET` | `/api/mautic/contacts` | Haal contacten op met zoekterm en paginering |
| `GET` | `/api/mautic/contacts/pipeline` | Haal pipeline-contacten op (gefilterd op `verkoopgesprek_status`) |
| `GET` | `/api/mautic/events` | Haal email events op per contact (clicks en opens) |
| `GET` | `/api/mautic/events/summary` | Samenvatting van email activiteit per contact |
| `POST` | `/api/mautic/events/webhook` | Verwerk inkomende Mautic email events (click/open) |

#### `POST /api/mautic/contact` — Body

| Veld | Vereist | Omschrijving |
|------|---------|--------------|
| `firstname` of `lastname` | ✅ (één van beide) | Naam contactpersoon |
| `phone` | | Telefoonnummer |
| `mobile` | | Mobiel nummer |
| `email` | | E-mailadres |
| `company` | | Bedrijfsnaam |

#### `PATCH /api/mautic/contact` — Body

```json
{
  "id": 123,
  "fields": {
    "firstname": "Jan",
    "ai_profiel_data": "{\"Interesse\":\"Verkoop\",\"Fase\":\"Oriëntatie\"}"
  }
}
```

Kan elk Mautic contactveld bijwerken, inclusief het custom veld `ai_profiel_data` (JSON string).

#### `GET /api/mautic/contacts` — Query parameters

| Parameter | Type | Omschrijving |
|-----------|------|--------------|
| `search` | `string` | Zoekterm (naam, e-mail, telefoon) |
| `page` | `number` | Paginanummer (standaard: `1`) |
| `limit` | `number` | Aantal resultaten per pagina (standaard: `30`) |

#### `GET /api/mautic/events` — Query parameters

| Parameter | Type | Omschrijving |
|-----------|------|--------------|
| `contactId` | `number` | ✅ Mautic contact ID |
| `limit` | `number` | Aantal events (standaard: `20`) |

#### `POST /api/mautic/events/webhook` — Body

Header: `x-webhook-secret`

Verwacht een Mautic webhook payload met `email.click` of `email.open` events. Events worden opgeslagen in de lokale `MauticEvent` tabel.

#### AI Data Profiel

Het AI data profiel wordt opgeslagen als JSON-string in het Mautic custom veld `ai_profiel_data` (type: textarea). Dit is een vrij key-value object dat via het contact detail panel in de telefonie en contacten module beheerd kan worden.

Voorbeeld inhoud:
```json
{
  "Interesse": "Verkoop woning",
  "Fase": "Oriëntatie",
  "Budget": "€ 350.000 - € 450.000",
  "Tijdlijn": "6 maanden"
}
```

De velden zijn dynamisch — medewerkers kunnen vrij velden toevoegen, aanpassen en verwijderen.

---

### Buurtdata `/api/buurtdata`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `POST` | `/api/buurtdata` | Proxy naar n8n webhook — haalt wijkdata op via postcode + huisnummer |

#### `POST /api/buurtdata` — Body

| Veld | Vereist | Omschrijving |
|------|---------|--------------|
| `postcode` | ✅ | Postcode (wordt genormaliseerd: spaties verwijderd, hoofdletters) |
| `huisnummer` | ✅ | Huisnummer (integer) |
| `huisletter` | | Optionele huisletter |
| `huisnummer_toevoeging` | | Optionele toevoeging |

De response bevat een uitgebreid JSON-object met onder andere: BAG-gegevens (oppervlakte, bouwjaar, gebruiksdoel), leefbaarheidscore, bevolkingsopbouw, woningmarktdata, inkomen, bereikbaarheid, klimaatdata, geluidsbelasting en luchtkwaliteit. Timeout: 30 seconden.

De buurtdata pagina (`/buurtdata`) toont deze data als een printbaar rapport geschikt om met klanten te delen.

---

## Database schema (relevante modellen)

### Task

| Veld | Type | Omschrijving |
|------|------|--------------|
| `totalTimeSpent` | `Int` | Totale geregistreerde tijd in seconden (afgesloten sessies) |
| `timerStartedAt` | `DateTime?` | Start van de lopende timersessie, `null` als gestopt |
| `completedAt` | `DateTime?` | Tijdstip van afronden (automatisch ingesteld) |

### TimeEntry

Elke timersessie per taak wordt opgeslagen als een aparte `TimeEntry`.

| Veld | Type | Omschrijving |
|------|------|--------------|
| `taskId` | `String` | Verwijzing naar de taak |
| `startedAt` | `DateTime` | Start van de sessie |
| `stoppedAt` | `DateTime?` | Einde van de sessie (`null` als nog lopend) |
| `duration` | `Int` | Duur in seconden (0 als nog lopend) |

### ProjectContact

Koppelt meerdere Mautic contacten aan een project. Vervangt de legacy `contactName` / `contactPhone` / `contactEmail` velden.

| Veld | Type | Omschrijving |
|------|------|--------------|
| `projectId` | `String` | Verwijzing naar het project |
| `mauticContactId` | `Int` | Mautic contact ID |
| `role` | `String` | Rol van het contact, bijv. `opdrachtgever`, `partner` |
| `label` | `String?` | Optioneel vrij label |
| `addedBy` | `String?` | E-mail van de medewerker die het contact heeft gekoppeld |

Unieke constraint op `(projectId, mauticContactId)`.

### MauticEvent

Lokale opslag van Mautic email activiteit (clicks en opens) voor weergave in contactpanels.

| Veld | Type | Omschrijving |
|------|------|--------------|
| `mauticContactId` | `Int` | Mautic contact ID |
| `eventType` | `String` | `email.click` of `email.open` |
| `emailName` | `String?` | Naam van de e-mailcampagne |
| `clickedUrl` | `String?` | Aangeklikte URL (bij `email.click`) |
| `occurredAt` | `DateTime` | Tijdstip van het event |

---

**SQL voor handmatige migraties (tijdregistratie):**
```sql
ALTER TABLE tasks ADD COLUMN timerStartedAt DATETIME NULL;
ALTER TABLE tasks ADD COLUMN totalTimeSpent INT NOT NULL DEFAULT 0;

CREATE TABLE time_entries (
  id VARCHAR(191) NOT NULL,
  taskId VARCHAR(191) NOT NULL,
  startedAt DATETIME(3) NOT NULL,
  stoppedAt DATETIME(3) NULL,
  duration INT NOT NULL DEFAULT 0,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX time_entries_taskId_idx (taskId),
  CONSTRAINT time_entries_taskId_fkey FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
);
```

---

## Omgevingsvariabelen

| Variabele | Omschrijving |
|-----------|--------------|
| `DATABASE_URL` | MySQL connectiestring voor Prisma |
| `NEXTAUTH_SECRET` | Secret voor NextAuth.js sessieversleuteling |
| `NEXTAUTH_URL` | Publieke URL van de applicatie |
| `N8N_WEBHOOK_SECRET` | Gedeeld geheim voor webhook authenticatie (`x-webhook-secret` header) |
| `MAUTIC_URL` | Basis-URL van de Mautic instantie |
| `MAUTIC_CLIENT_ID` | Mautic OAuth2 client ID |
| `MAUTIC_CLIENT_SECRET` | Mautic OAuth2 client secret |
| `NEXT_PUBLIC_MAUTIC_URL` | Publieke Mautic URL (voor frontend links naar contactpagina's) |
| `CALL_NOTE_WEBHOOK_URL` | Optionele webhook URL die wordt aangeroepen bij het opslaan van een gespreksnotitie |
| `NEXT_PUBLIC_DEBITEUREN_URL` | Externe link naar het debiteuren/facturatie systeem (zichtbaar in sidebar) |

---

## Development

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Deployment

Automatisch via GitHub Actions → GHCR → Portainer. Push naar `main` triggert een build en deploy.

> **Let op:** database migraties worden handmatig uitgevoerd via SQL of `npx prisma db push`. De container draait geen automatische migraties bij opstarten.
