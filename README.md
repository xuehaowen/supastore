# SupaStore

A self-hosted, full-stack commerce engine for independent merchants who manage availability manually and collect bank/manual payments before preparing orders. Storefront, merchant admin, outbox worker, and APIs run in a unified, lean deployment.

Licensed under MIT.

---

## Key Highlights

- **Lean Production Runtime:** Node.js 22 Alpine multi-stage Docker container (<80MB image, <256MB–512MB RAM ceiling).
- **Zero-External-Cache Architecture:** Redis-free architecture using PostgreSQL session management, row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`), and in-memory LRU token buckets.
- **Transactional Outbox Worker:** Reliable asynchronous email notification worker with durable delivery leases and bounded exponential backoff (1m, 5m, 15m, 1h, 6h $\to$ exhausted).
- **Exact Financial Invariants:** Integer minor-unit arithmetic, canonical financial projections, audited receipt corrections, and component-level payout discrepancies.
- **Merchant Daily Queue:** Mobile-first admin dashboard for order confirmation, packing slips, thermal printing (58mm/80mm), cash reconciliation, and CSV tools.
- **Disaster Recovery & Safety:** Verified cold restore procedures with mandatory outbound email suppression (`DISABLE_OUTBOUND_DELIVERY=true`).

---

## Quickstart

### Prerequisites
- Node.js 22 LTS or newer
- pnpm 9+
- PostgreSQL 16+ (or Docker)

### 1. Clone and Install
```bash
git clone https://github.com/xuehaowen/supastore.git
cd supastore
pnpm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` to set your `DATABASE_URL`, `ADMIN_SETUP_SECRET`, and `BETTER_AUTH_SECRET`.

### 3. Run Migrations & Seed Demo Store
```bash
# Apply database migrations
pnpm db:migrate

# Seed synthetic demo catalog & owner (owner@example.test / AdminSetupSecret123!)
M1_DEMO=true DEMO_OWNER_PASSWORD=AdminSetupSecret123! pnpm db:seed
```

### 4. Start Development Server
```bash
pnpm dev
```
- Storefront: [http://localhost:3000](http://localhost:3000)
- Admin Portal: [http://localhost:3000/admin](http://localhost:3000/admin)
- Health Check: [http://localhost:3000/api/health/ready](http://localhost:3000/api/health/ready)

Customers check out as guests and access their orders through private links; customer account registration is not implemented. The admin login is sign-in only, and public registration requests are blocked. The demo seed provisions its owner through trusted server-side tooling.

For verification emails, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `.env`. Port 465 automatically uses implicit TLS; port 587 uses STARTTLS. `SMTP_SECURE` can override this for local development. Verification goes to the signed-in owner’s email address. A successful send means the SMTP server accepted it; check that inbox and its spam folder. Docker Compose reads the SMTP credentials from the environment.

Checkout shows a final total before placing the order. Pickup requires a location and an eligible pickup window, without a shipping address. Each location has its own schedule, preparation time, and blackout dates. The internal price snapshot is revalidated when placing an order so changed prices cannot be accepted silently.

---

## Docker & Deployment

Run Supastore and PostgreSQL via Docker Compose:

```bash
docker compose up -d
```

See [Deployment Recipes](docs/deployment-recipes.md) for Coolify, Railway, Fly.io, and managed cloud databases.

---

## Testing & Quality Assurance

```bash
# Run the default fast suite (unit + synthetic lifecycle)
pnpm test

# Run unit tests only
pnpm test:unit

# Run real PostgreSQL integration tests with an isolated embedded database
pnpm test:integration

# Enforce 90% minimum coverage for lines, statements, functions, and branches;
# write HTML/LCOV reports to coverage/
pnpm test:coverage

# Verify strict TypeScript types
pnpm typecheck

# Run memory consumption benchmark
pnpm bench:memory

# Run Playwright End-to-End tests
pnpm test:e2e
```

---

## Documentation Index

| Document | Description |
|---|---|
| [Product Scope](docs/product-scope.md) | Audience, release boundary and document ownership |
| [Business Workflows](docs/business-workflows.md) | User operations and state transitions |
| [Transaction Contracts](docs/transaction-contracts.md) | Financial calculations, locking, retries and executable examples |
| [Data Model](docs/database-schema.md) | Entities, relationships, constraints and retention |
| [Events Spec](docs/api-events-spec.md) | Notification contracts and worker coordination |
| [Architecture Overview](docs/architecture-overview.md) | Stack, module boundaries and authorization |
| [Critical User Journeys](docs/critical-user-journeys.md) | Acceptance outcomes and verification coverage |
| [Deployment Recipes](docs/deployment-recipes.md) | Self-hosted, VPS, and Cloud deployment guides |
| [Merchant Operations](docs/merchant-operations.md) | Setup wizard and daily administrative queues |
| [Disaster Recovery Playbook](docs/playbooks/disaster-recovery.md) | Cold backup restore and safety checklists |
| [Outbox Reconciliation](docs/playbooks/outbox-reconciliation.md) | Event audit and queue recovery workflows |

---

## Contributing & Security

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [LICENSE](LICENSE).
