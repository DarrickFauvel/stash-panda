# Stash Panda — Product Specification

## Overview

Stash Panda is a mobile-first Progressive Web App (PWA) for tracking inventory of anything — physical items, digital assets, subscriptions, and documents. It supports households and small businesses with multi-user shared inventories, offline-first operation, and a full usage history per item.

---

## Target Users

- **Individuals & households** — home inventory, pantry, tools, valuables, documents
- **Small businesses** — supplies, equipment, consumables, assets

---

## Item Data Model

Every item tracks:

| Field | Type | Notes |
|---|---|---|
| Name | string | required |
| Quantity | number | supports decimals |
| Unit | string | e.g. "kg", "boxes", "units" |
| Location | string/reference | room, shelf, container — hierarchical |
| Category | string/reference | user-defined or preset |
| Tags | string[] | freeform |
| Photo | image | captured via camera or uploaded |
| Value | currency | purchase or estimated value |
| Purchase date | date | |
| Expiry date | date | optional |
| Barcode / QR | string | scan or manual entry |
| Description / notes | text | freeform |
| Item type | enum | physical, digital, subscription, document |
| Custom fields | key-value | user-defined per item or category |

---

## Item Types

| Type | Examples |
|---|---|
| Physical | tools, food, clothing, furniture |
| Digital | software licenses, game keys, ebooks |
| Subscription | Netflix, SaaS tools, gym memberships |
| Document | passports, warranties, insurance policies |

---

## Core Features

### 1. Add Item
- Quick-add flow: name + quantity minimum to create
- Full-add flow: all fields available
- Camera capture for photo
- Barcode/QR scan (nice-to-have, progressive enhancement)
- Assign to inventory, location, category, tags

### 2. Search & Filter
- Full-text search across all text fields (name, description, tags, notes)
- Combinable filters:
  - Category
  - Location (hierarchical drill-down)
  - Tags
  - Item type
  - Quantity range (e.g. below threshold)
  - Date ranges (purchase, expiry)
- Sort by: name, quantity, date added, value
- Results update as filters change

### 3. Log a Use
- Supports both **deducting** (use) and **adding** (restock) quantity
- Record: amount, direction (used/restocked), who, timestamp, optional note
- Updates current quantity immediately
- Works offline; syncs when connection restored

### 4. Item Detail View
- All fields displayed and editable
- Current quantity with +/− quick controls
- Usage log (chronological list of log entries)
- Photo gallery (unlimited photos per item)
- Delete item — hard delete, permanent, no recovery

### 5. Inventory Organization
- Users can create multiple named inventories (e.g. "Home", "Workshop", "Office")
- Categories and locations are **scoped per inventory** — not shared across inventories
- Locations are hierarchical (e.g. Kitchen > Pantry > Top Shelf)

### 6. Export
- Export an inventory or filtered item list to CSV
- Export to PDF (formatted report with photos optional)
- Export scope: all items, filtered view, or single item history

---

## Multi-User & Sharing

### Inventories
- A user can belong to multiple inventories
- Each inventory is independent with its own member list

### Invitation Flow
1. Owner sends invite via email
2. Recipient receives email with join link
3. If they have an account, they join immediately
4. If not, they create an account then join

### Roles

| Role | Permissions |
|---|---|
| **Owner** | Full access; manage members; delete inventory; transfer ownership |
| **Editor** | Add/edit/delete items; log uses; manage locations & categories |
| **Viewer** | Read-only; can export; cannot modify anything |

- One owner per inventory (transferable)
- Multiple editors and viewers allowed
- Owner can change any member's role or remove them

---

## Offline & Sync

- App is fully functional offline: browse, add, edit, log uses
- Changes are queued locally (IndexedDB / service worker)
- On reconnect, changes sync to server automatically
- **Conflict resolution:** last-write-wins per field, with server timestamp as authority
- Real-time sync when online via WebSockets or Server-Sent Events
- Sync status indicator visible in UI (synced / pending / error)

---

## PWA Requirements

- Installable to home screen (Web App Manifest)
- Splash screen and themed status bar
- Offline-capable via Service Worker with cache-first strategy for app shell
- Push notification infrastructure ready (for future alerting features)
- Camera API for photo capture
- Target: Google Chrome (Android & Desktop); standard PWA APIs only
- Responsive layout, mobile-first breakpoints

---

## Authentication

- Email + password
- Email verification on signup
- Password reset via email
- Session persistence (stay logged in)
- Single account, multiple inventories

---

## Data Export

| Format | Content |
|---|---|
| CSV | Item fields as columns; one row per item |
| PDF | Formatted report; optional photos; usage log optional |

Export is scoped to: current inventory, filtered view, or single item.

---

## Navigation Structure

```
/ (home)
  └── /inventories
        ├── /inventories/:id              — inventory dashboard
        │     ├── /inventories/:id/items  — item list / search
        │     └── /inventories/:id/items/:itemId — item detail
        └── /inventories/new             — create inventory

/profile                                 — account settings
/invite/:token                           — accept invite
```

---

## Tech Stack

Minimal dependencies. Standards-first. No build step required on the frontend.

### Frontend
| Layer | Approach |
|---|---|
| Language | Vanilla JS (ES Modules, no transpiler) |
| UI components | **HTML Web Components** — Custom Elements that wrap server-rendered or plain HTML; no Shadow DOM, no template encapsulation |
| Reactivity / UI updates | **Datastar** — loaded via `<script>` tag (no npm); drives DOM merging, signals, and SSE consumption |
| Styling | Modern CSS — custom properties, grid, flexbox, container queries |
| Routing | History API (`pushState`) with a small hand-rolled router |
| Offline storage | IndexedDB via native API (or `idb` — 1kb wrapper for ergonomics) |
| Sync queue | Service Worker + Background Sync API |
| Realtime | Datastar SSE consumer (built-in) — no WebSocket code needed |
| Camera / media | `getUserMedia` + `<input type="file" capture>` |
| PWA | Web App Manifest + Service Worker (no framework needed) |

**HTML Web Components pattern:** components are defined as custom elements that enhance existing HTML in the document. JavaScript is layered on top of markup — if JS fails, the HTML still renders. No Shadow DOM means global CSS applies naturally and no slot/piercing complexity.

```html
<!-- markup first, JS enhances -->
<quantity-stepper>
  <button data-action="decrement">−</button>
  <input type="number" value="3" />
  <button data-action="increment">+</button>
</quantity-stepper>
```

```js
class QuantityStepper extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this)
  }
  handleEvent(e) {
    const action = e.target.dataset.action
    const input = this.querySelector('input')
    if (action === 'increment') input.valueAsNumber++
    if (action === 'decrement') input.valueAsNumber--
  }
}
customElements.define('quantity-stepper', QuantityStepper)
```

### Backend
| Layer | Approach |
|---|---|
| Runtime | Node.js |
| Framework | **Express** — handles routing and SSE endpoint management |
| Templating | **Eta** — renders full pages and HTML fragments; ~3kb, zero dependencies, native Express integration |
| Database | **Turso** (libSQL / distributed SQLite) via `@libsql/client` |
| Realtime | **Express SSE** — `res.write()` with `text/event-stream`; server pushes HTML fragments or signal patches to Datastar clients |
| Auth | Hand-rolled: bcrypt for passwords, `jsonwebtoken` for session tokens, email via `nodemailer` |
| File storage | Local filesystem (dev) → Cloudflare R2 (prod, S3-compatible) |
| Hosting | Fly.io, Railway, or DigitalOcean — frontend served as static files from the same Express process |

**Datastar + SSE pattern:** the server keeps an open SSE connection per client. When inventory data changes (item added, quantity updated, etc.), the server pushes a Datastar `merge-fragments` or `merge-signals` event to all connected members of that inventory. Datastar on the client merges the HTML/signal diff into the live DOM — no client-side diffing code needed.

```
Client                          Express Server
  |                                   |
  |-- GET /events (SSE) ------------>|  (keep-alive connection)
  |                                   |
  |-- POST /items/42/use ----------->|  (log a use)
  |                                   |-- UPDATE turso DB
  |                                   |-- broadcast to inventory members:
  |<-- event: datastar-merge-signals  |   { item_42_qty: 11 }
  |<-- event: datastar-merge-fragments|   <item-row id="item-42">...</item-row>
```

**Turso notes:** hosted distributed libSQL (SQLite-compatible). `@libsql/client` works in Node.js with standard SQL. Embedded replicas support low-latency local reads — pairs well with the offline-first IndexedDB sync model.

### Dependency count target
- Frontend: **0 npm dependencies** (Datastar loaded via CDN script tag; optionally `idb` for IndexedDB)
- Backend: **6–7 packages** (`express`, `eta`, `@libsql/client`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, optionally `multer` for file uploads)

---

## Out of Scope (v1)

- Push notifications / low stock alerts
- Barcode lookup (product name from barcode database)
- Mobile native app (iOS/Android)
- AI-powered features
- Payment / subscription tiers
- Public item sharing or marketplace

---

