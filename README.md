# SupaStore

A self-hosted commerce application for independent merchants, with catalog options, collections, stock tracking, customer accounts, store credit and rewards, manual and Stripe payments, refunds, and physical returns. Backend and storefront are independently deployable applications; the backend owns merchant admin, APIs, authentication, and the outbox worker. Combined local development remains available.

Start with [Current System Capabilities](docs/system-capabilities.md) for implemented features and limits, and the [Maintenance Guide](docs/system-maintenance.md) for operational workflows. Directory READMEs explain the code beside each module; the navigation index below links their entry points.

Licensed under MIT.

---

## Key Highlights

- **Production Runtime:** Separate Next.js backend and storefront applications with PostgreSQL, S3-compatible storage, and SMTP. Container size and memory budgets require representative load measurement; they are not guaranteed limits. See [two-service deployment](docs/two-service-deployment.md) and [release evidence](docs/generic-store-release-evidence.md).
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

Customers can check out as guests using private order links or register and verify an account. Verified accounts have an address book, owned order history, and store credit. Claiming a guest order requires its private access proof; matching an email address does not transfer ownership. The admin login is sign-in only; trusted server-side tooling provisions the owner.

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

# Enforce 90% minimum pure-domain coverage for lines, statements, functions, and branches;
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

For short explanations beside the code, open the directory READMEs:

- [Backend source](src/README.md): routes, business workflows, domain rules, and integrations.
- [Applications](apps/README.md): backend launcher and separate customer storefront.
- [Shared packages](packages/README.md): HTTP contracts, localization, and destination helpers.
- [Scripts](scripts/README.md): development, deployment, migration, and recovery tools.
- [Tests](tests/README.md): unit, integration, and browser verification.

Each module README explains its responsibility, maintenance constraints, and where to find more detail. These cover module boundaries; individual dynamic page and route folders are described by their owning UI/API README.

| Document                                                          | Description                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Current System Capabilities](docs/system-capabilities.md)        | Implemented capabilities, boundaries, workflows and evidence limits |
| [System Maintenance Guide](docs/system-maintenance.md)            | Configuration, verification, diagnosis, upgrades and recovery       |
| [Product Scope](docs/product-scope.md)                            | Audience, release boundary and document ownership                   |
| [Business Workflows](docs/business-workflows.md)                  | User operations and state transitions                               |
| [Transaction Contracts](docs/transaction-contracts.md)            | Financial calculations, locking, retries and executable examples    |
| [Data Model](docs/database-schema.md)                             | Entities, relationships, constraints and retention                  |
| [Events Spec](docs/api-events-spec.md)                            | Notification contracts and worker coordination                      |
| [Architecture Overview](docs/architecture-overview.md)            | Stack, module boundaries and authorization                          |
| [Critical User Journeys](docs/critical-user-journeys.md)          | Acceptance outcomes and verification coverage                       |
| [Deployment Recipes](docs/deployment-recipes.md)                  | Self-hosted, VPS, and Cloud deployment guides                       |
| [Merchant Operations](docs/merchant-operations.md)                | Setup wizard and daily administrative queues                        |
| [Disaster Recovery Playbook](docs/playbooks/disaster-recovery.md) | Cold backup restore and safety checklists                           |
| [Outbox Reconciliation](docs/playbooks/outbox-reconciliation.md)  | Event audit and queue recovery workflows                            |

---

## Contributing & Security

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [LICENSE](LICENSE).
