# De Vree Makelaardij — Kantoor Platform

Centraal kantoor platform dat alle systemen van De Vree Makelaardij met elkaar verbindt.

## Modules

- **Telefonie** — Live call popups, call history, Mautic CRM koppeling
- **Taken** — Kanban + tabel, per makelaar en centraal voor binnendienst
- **Projecten** — Woningdossiers gekoppeld aan taken, calls en Notion
- **Mautic** — CRM contact opzoeken en aanmaken
- **Notion** — Bidirectionele sync via n8n webhooks

## Tech Stack

Next.js · TypeScript · Tailwind CSS · Prisma · MySQL · NextAuth.js · Docker

---

## API Overzicht

Alle endpoints vereisen een actieve sessie (cookie-authenticatie via NextAuth), tenzij anders aangegeven. Webhooks gebruiken `x-webhook-secret` header verificatie.

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
| `POST` | `/api/mautic/contact` | Maak een nieuw contact aan in Mautic |

#### `POST /api/mautic/contact` — Body

| Veld | Vereist | Omschrijving |
|------|---------|--------------|
| `firstname` of `lastname` | ✅ (één van beide) | Naam contactpersoon |
| `phone` | | Telefoonnummer |
| `mobile` | | Mobiel nummer |
| `email` | | E-mailadres |
| `company` | | Bedrijfsnaam |

---

## Omgevingsvariabelen

| Variabele | Omschrijving |
|-----------|--------------|
| `DATABASE_URL` | MySQL connectiestring voor Prisma |
| `NEXTAUTH_SECRET` | Secret voor NextAuth.js sessieversleuteling |
| `NEXTAUTH_URL` | Publieke URL van de applicatie |
| `N8N_WEBHOOK_SECRET` | Gedeeld geheim voor webhook authenticatie |
| `MAUTIC_URL` | Basis-URL van de Mautic instantie |
| `MAUTIC_USERNAME` | Mautic API gebruikersnaam |
| `MAUTIC_PASSWORD` | Mautic API wachtwoord |

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
