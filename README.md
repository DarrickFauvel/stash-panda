# Pocket Universe 🌌

Track everything that matters — at home, at work, anywhere.

Pocket Universe is a mobile-first PWA for tracking inventory of anything: physical items, digital assets, subscriptions, and documents. It supports households and small businesses with multi-user shared collections, offline-first operation, and a full usage history per item.

## Features

- **Any kind of inventory** — physical items, digital assets, subscriptions, documents
- **Shared collections** — invite family, roommates, or coworkers with role-based access (owner, editor, viewer)
- **Offline-first** — changes queue locally and sync when back online
- **Barcode scanning** — look up products instantly via camera
- **Board Game Geek integration** — auto-fill game metadata by title
- **Hierarchical locations** — organize items by room, shelf, container, etc.
- **Usage history** — full audit log per item
- **PWA** — installable on iOS and Android, works like a native app

## Tech stack

- **Backend** — Node.js + Express (TypeScript), LibSQL (Turso)
- **Frontend** — Vanilla JS, vanilla CSS, no build step
- **Reactivity** — [Datastar](https://data-star.dev) for SSE-driven UI updates
- **Auth** — JWT, bcrypt
- **Deployment** — Railway

## Getting started

```bash
cp .env.example .env   # add JWT_SECRET and LIBSQL_URL + LIBSQL_AUTH_TOKEN
npm install
npm run dev            # runs on http://localhost:3000
```

### Environment variables

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret for signing JWTs |
| `LIBSQL_URL` | LibSQL / Turso database URL |
| `LIBSQL_AUTH_TOKEN` | Auth token for Turso (leave empty for local) |
| `EMAIL_*` | SMTP config for verification and password reset emails |

## Scripts

```bash
npm run dev        # start with file watching
npm run migrate    # run migrations manually
npm run typecheck  # TypeScript type check
```
