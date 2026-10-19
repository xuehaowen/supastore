# Supastore

A self-hosted commerce application for independent merchants, with catalog options, collections, stock tracking, customer accounts, store credit and rewards, manual and Stripe payments, refunds, and physical returns. Backend and storefront are independently deployable applications; the backend owns merchant admin, APIs, authentication, and the outbox worker. Combined local development remains available.

Start with [Current System Capabilities](docs/system-capabilities.md) for implemented features and limits, the [Operator Cookbook](docs/operator-cookbook.md) for task recipes, and the [Command Reference](docs/commands.md) for commands and prerequisites. Directory READMEs explain the code beside each module; the navigation index below links their entry points.

The workspace contains `apps/backend` for admin, APIs and workers, `apps/storefront` for the original customer pages, and `packages/{ui,i18n,shipping,contracts}` for shared presentation and public contracts. Root scripts coordinate development, database setup and testing. The backend reads the existing root `.env`; the storefront communicates through HTTP.

Licensed under MIT.

---

## Key Highlights

- **Production Runtime:** Separate Next.js backend and storefront applications with PostgreSQL, S3-compatible storage, and SMTP. Container size and memory budgets require representative load measurement; they are not guaranteed limits. See [two-service deployment](docs/two-service-deployment.md) and [release evidence](docs/generic-store-release-evidence.md).
- **Zero-External-Cache Architecture:** Redis-free architecture using PostgreSQL session management, row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`), and in-memory LRU token buckets.
- **Transactional Outbox Worker:** Reliable asynchronous email notification worker with durable delivery leases and bounded exponential backoff (1m, 5m, 15m, 1h, 6h $\to$ exhausted).
- **Exact Financial Invariants:** Integer minor-unit arithmetic, canonical financial projections, audited receipt corrections, and component-level payout discrepancies.
- **Contextual Commerce Rules:** Optional prices, availability, rewards, shipping minimums and promotion eligibility by fulfillment or destination, with customer previews and server-enforced quotes. See [commerce evaluation](docs/commerce-evaluation.md).
- **Merchant Daily Queue:** Mobile-first admin dashboard for order confirmation, packing slips, thermal printing (58mm/80mm), cash reconciliation, and CSV tools.
- **Disaster Recovery & Safety:** Verified cold restore procedures with mandatory outbound email suppression (`DISABLE_OUTBOUND_DELIVERY=true`).

---

## Quickstart

### Prerequisites

- Node.js >=22.13.0
- pnpm 11.0.9 (the repository's `packageManager` version)
- Docker Compose for the supplied PostgreSQL 18/RustFS stack, or separately configured services

### 1. Clone and Install

```bash
git clone https://github.com/xuehaowen/supastore.git
cd supastore
pnpm install --frozen-lockfile
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` to set your `DATABASE_URL` and separate generated credentials for
`POSTGRES_PASSWORD`, `APP_DATABASE_PASSWORD`, `ADMIN_SETUP_SECRET`, `BETTER_AUTH_SECRET`, `S3_ACCESS_KEY_ID`
and `S3_SECRET_ACCESS_KEY`. Use at least 32 random characters for the authentication
secret. `DATABASE_URL` uses the application role password; `MIGRATION_DATABASE_URL`
uses the PostgreSQL administrator password. Migrations provision the application
role when `APP_DATABASE_USER` and `APP_DATABASE_PASSWORD` are set. See the
[deployment guide](docs/two-service-deployment.md) for generation and existing-volume recovery.

### 3. Start Dependencies, Migrate & Seed a Local Demo

Use a dedicated local database. Before starting the application, set
`DISABLE_OUTBOUND_DELIVERY=true` and `ENABLE_OUTBOX_WORKER=false` in the demo `.env`.

```bash
docker compose up -d postgres rustfs

# Apply database migrations
pnpm db:migrate

# Seed synthetic demo catalog & owner (owner@example.test / AdminSetupSecret123!)
node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx --input-type=module -e "process.env.DEMO_SEED='true'; process.env.DATABASE_URL=process.env.MIGRATION_DATABASE_URL; await import('./scripts/seed-demo.ts')"
```

The seed command requires the configured `MIGRATION_DATABASE_URL` and uses it
only in its child process because the seed also runs migrations. It uses the
synthetic default password; set `DEMO_OWNER_PASSWORD`
in the demo environment to override it. It works in Bash and PowerShell. Never
seed a real merchant database. In the RustFS console at `http://localhost:9001`,
create the buckets named by `S3_BUCKET_PUBLIC` and `S3_BUCKET_PRIVATE` before
testing uploads. See the [local demo recipe](docs/operator-cookbook.md#local-demo-store)
for expected results and storage checks. A real store uses the separate
[first-owner recipe](docs/operator-cookbook.md#provision-the-first-owner).

### 4. Start Development Server

```bash
pnpm dev
```

This starts the backend on port 3000 and the original customer storefront on port 3001. To run them in separate terminals, use `pnpm dev:backend` and `pnpm dev:storefront`. Development launchers default the public origin to port 3001 when none is configured, without changing `.env`.

`pnpm build` builds both apps, and `pnpm start` runs both production servers.
Use `build:backend`, `build:storefront`, `start:backend` and `start:storefront`
for individual services. `BACKEND_PORT` and `STOREFRONT_PORT` select their ports.
Production requires an explicit public origin; use `STOREFRONT_ORIGIN` and keep
any `APP_URL`/`BETTER_AUTH_URL` aliases consistent. See the command reference for
environment-file precedence. `pnpm test:all` runs the main verification chain;
the error-coverage and container checks are separate commands.

- Storefront: [http://localhost:3001](http://localhost:3001)
- Admin Portal: [http://localhost:3001/admin](http://localhost:3001/admin)
- Health Check: [http://localhost:3000/api/health/ready](http://localhost:3000/api/health/ready)

Customers can check out as guests using private order links or register and verify an account. Verified accounts have an address book, owned order history, and store credit. Claiming a guest order requires its private access proof; matching an email address does not transfer ownership. The admin login is sign-in only; trusted server-side tooling provisions the owner.

For verification emails, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `.env`. Port 465 automatically uses implicit TLS; port 587 uses STARTTLS. `SMTP_SECURE` can override this for local development. Verification goes to the signed-in owner’s email address. A successful send means the SMTP server accepted it; check that inbox and its spam folder. Docker Compose reads the SMTP credentials from the environment.

Checkout shows a final total before placing the order. Pickup requires a location and an eligible pickup window, without a shipping address. Each location has its own schedule, preparation time, and blackout dates. The internal price snapshot is revalidated when placing an order so changed prices cannot be accepted silently.

---

## Docker & Deployment

Build the services, start dependencies, and run the explicit migration job before
starting the applications:

```bash
docker compose build backend storefront migrate
docker compose up -d postgres rustfs
docker compose --profile migration run --rm migrate
docker compose up -d backend storefront
```

Configure secrets, storage buckets, the public origin and ingress first. For an
existing installation, back up and rehearse the upgrade before migrations. See
the [deployment cookbook](docs/operator-cookbook.md#deploy-or-upgrade-with-compose)
and [Deployment Recipes](docs/deployment-recipes.md). Other container platforms
have general configuration guidance; provider-specific deployment acceptance is
separate.

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

# Measure isolated backend/storefront processes after production browser journeys
# Linux uses standalone servers; Windows uses Next CLI. PostgreSQL and Chromium are required.
pnpm bench:memory

# Run Playwright End-to-End tests
pnpm test:e2e
```

---

## Documentation Index

For short explanations beside the code, open the directory READMEs:

- [Backend source](apps/backend/src/README.md): routes, business workflows, domain rules, and integrations.
- [Applications](apps/README.md): backend launcher and separate customer storefront.
- [Shared packages](packages/README.md): HTTP contracts, localization, and destination helpers.
- [Scripts](scripts/README.md): development, deployment, migration, and recovery tools.
- [Tests](tests/README.md): unit, integration, and browser verification.

Each module README explains its responsibility, maintenance constraints, and where to find more detail. These cover module boundaries; individual dynamic page and route folders are described by their owning UI/API README.

| Document                                                          | Description                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Current System Capabilities](docs/system-capabilities.md)        | Implemented capabilities, boundaries, workflows and evidence limits |
| [Command Reference](docs/commands.md)                             | Every package command, prerequisites, effects and outputs           |
| [Operator Cookbook](docs/operator-cookbook.md)                    | Local setup, owner provisioning, deployment, recovery and diagnosis |
| [Production Acceptance](docs/launch-acceptance.md)                | Target, HTTPS, live providers, recovery and release evidence        |
| [Human Merchant Pilot](docs/merchant-pilot.md)                    | Participant task script, observation sheet and acceptance criteria  |
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
