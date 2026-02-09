# De Vree Makelaardij — Kantoor Platform

Centraal kantoor platform dat alle systemen van De Vree Makelaardij met elkaar verbindt.

## Modules

- **Telefonie** — Live call popups, call history, Mautic CRM koppeling
- **Taken** — Kanban + tabel, per makelaar en centraal voor binnendienst
- **Facturatie** — Link naar bestaand debiteuren systeem
- **Notion** — Integratie via n8n (placeholder)

## Tech Stack

Next.js 16 · TypeScript · Tailwind CSS · Prisma · MySQL · NextAuth.js · Docker

## Development

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Deployment

Automatisch via GitHub Actions → GHCR → Portainer. Push naar `main` triggert een build en deploy.
