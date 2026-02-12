# De Vree Makelaardij — Kantoor Platform

Centraal kantoor platform dat alle systemen van De Vree Makelaardij met elkaar verbindt.

## Modules

- **Telefonie** — Live call popups, call history, Mautic CRM koppeling, notities per gesprek, contact detail panel met AI data profiel
- **Taken** — Kanban + tabel, per makelaar en centraal voor binnendienst
- **Projecten** — Woningdossiers gekoppeld aan taken, calls en Notion
- **Mautic** — CRM contact opzoeken, aanmaken en bijwerken (inclusief AI profiel)
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
| `sortBy` | `string` | Sorteerveld: `status` \| `priority` \| `dueDate` \| `createdAt` \| `title` (standaard: `status`) |
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

### Projecten `/api/projecten`

| Methode | Endpoint | Omschrijving |
|---------|----------|--------------|
| `GET` | `/api/projecten` | Haal projecten op met filters en paginering |
| `POST` | `/api/projecten` | Maak een nieuw project aan |
| `PATCH` | `/api/projecten` | Werk een bestaand project bij |
| `DELETE` | `/api/projecten` | Verwijder een project (ontkoppelt taken en calls eerst) |
| `GET` | `/api/projecten/[id]` | Haal één project op inclusief alle taken en calls |
| `POST` | `/api/projecten/webhook` | Verwerk projecten van n8n / Notion sync (upsert op `notionPageId`) |

#### `GET /api/projecten` — Query parameters

| Parameter | Type | Omschrijving |
|-----------|------|--------------|
| `status` | `string` | Filter op projectstatus (bijv. `lead`, `actief`, `verkocht`) |
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

Elk project bevat `_count.tasks` en `_count.calls`.

#### `GET /api/projecten/[id]`

Geeft één project terug inclusief alle gekoppelde taken (met toegewezen gebruiker) en de laatste 50 calls.

#### `POST /api/projecten` — Body

| Veld | Vereist | Omschrijving |
|------|---------|--------------|
| `name` | ✅ | Projectnaam |
| `description` | | Omschrijving |
| `status` | | Projectstatus (standaard: `lead`) |
| `address` | | Adres van het object |
| `contactName` | | Naam contactpersoon |
| `contactPhone` | | Telefoonnummer contactpersoon |
| `contactEmail` | | E-mail contactpersoon |
| `notionPageId` | | Notion pagina ID voor sync |
| `mauticContactId` | | Mautic contact ID |

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
| `reason` | `string` | Reden van beëindiging (bijv. `completed`, `missed`) |
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

#### AI Data Profiel

Het AI data profiel wordt opgeslagen als JSON-string in het Mautic custom veld `ai_profiel_data` (type: textarea). Dit is een vrij key-value object dat via het contact detail panel in de telefonie module beheerd kan worden.

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

## Omgevingsvariabelen

| Variabele | Omschrijving |
|-----------|--------------|
| `DATABASE_URL` | MySQL connectiestring voor Prisma |
| `NEXTAUTH_SECRET` | Secret voor NextAuth.js sessieversleuteling |
| `NEXTAUTH_URL` | Publieke URL van de applicatie |
| `N8N_WEBHOOK_SECRET` | Gedeeld geheim voor webhook authenticatie |
| `MAUTIC_URL` | Basis-URL van de Mautic instantie |
| `MAUTIC_CLIENT_ID` | Mautic OAuth2 client ID |
| `MAUTIC_CLIENT_SECRET` | Mautic OAuth2 client secret |
| `NEXT_PUBLIC_MAUTIC_URL` | Publieke Mautic URL (voor frontend links naar contactpagina's) |
| `CALL_NOTE_WEBHOOK_URL` | Optionele webhook URL die wordt aangeroepen bij het opslaan van een gespreksnotitie |
| `DEBITEUREN_URL` | Externe link naar het debiteuren systeem |

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
