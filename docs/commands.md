# Command reference

Run commands from the repository root with Node >=22.13.0 and pnpm 11.0.9.
This inventory follows root `package.json`; task sequences are in the
[operator cookbook](operator-cookbook.md). Use `pnpm run <name> <arguments>`
to forward arguments. Commands without arguments below need none.

## Environment and prerequisites

Development package launchers preload `.env`, then `.env.local`. Build/start
launchers preload `.env`, `.env.production`, `.env.local`, then
`.env.production.local`. Later files win; existing shell variables win over files.
Launchers themselves validate in-memory settings only. Direct script invocation
does not imply the same preload behavior.

Database seed/recovery tools use `scripts/load-env.ts` to load `.env` and
`.env.local`; existing variables are retained by `process.loadEnvFile`, so an
earlier loaded value wins. Migrations and service probes read `.env`; `db:init`
also reads `.env`. These tools do not automatically select production files.
Explicitly supply the intended target environment for production operations.
Drizzle schema tools consume the environment in `drizzle.config.ts`; export
the selected database variables before `db:studio`/`db:generate` (the config
otherwise has a local development connection fallback). Bash backup/restore tools
require exported connection settings and do not load `.env`.

Production uses an explicit public origin. Set `STOREFRONT_ORIGIN`; keep any
`APP_URL` and `BETTER_AUTH_URL` aliases consistent. `BACKEND_URL` is private and
also enters compiled admin rewrites. Database/provider credentials belong on
the backend. See [deployment configuration](two-service-deployment.md).

Browser runners need Chromium (`pnpm exec playwright install chromium`) and an
embedded PostgreSQL runtime supported by the host. Linux CI may need Chromium
system libraries. Container acceptance additionally needs Docker Compose.
Fixture runners allocate their own databases/ports; run them separately when
ports overlap. Bash/PostgreSQL client tools are required for shell recovery tests.

## Install, run and build

| Command                          | Prerequisites and effects                                          | Result                                             |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Registry access or populated package cache                         | Locked workspace dependencies                      |
| `pnpm run dev`                   | Configured database/storage; starts both apps                      | Backend :3000, storefront :3001; Ctrl+C stops both |
| `pnpm run dev:backend`           | Backend environment/dependencies                                   | Backend development server                         |
| `pnpm run dev:storefront`        | Reachable backend                                                  | Storefront development server                      |
| `pnpm run build`                 | Runs both production builds in sequence                            | App build directories                              |
| `pnpm run build:backend`         | Backend build environment                                          | `apps/backend/.next` by default                    |
| `pnpm run build:storefront`      | Backend target and public analytics settings selected before build | `apps/storefront/.next` by default                 |
| `pnpm run start`                 | Both builds, production configuration, live dependencies           | Both production servers                            |
| `pnpm run start:backend`         | Backend build/configuration                                        | Backend production server                          |
| `pnpm run start:storefront`      | Storefront build/configuration                                     | Storefront production server                       |

`BACKEND_PORT` and `STOREFRONT_PORT` select package-launcher listening ports.
Standalone Docker containers each listen on 3000. Build outputs can be redirected
with the documented Next configuration variables; see the deployment guide.
`NEXT_PUBLIC_ANALYTICS_ENDPOINT` is optional, HTTPS-only and compiled into the
storefront: changing it requires a rebuild. Browser consent still gates sending.

## Formatting, types and tests

| Command                           | Scope and effect                                                          | Result                                                             |
| --------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm run typecheck`              | Root, backend and storefront TypeScript                                   | Nonzero on type errors                                             |
| `pnpm run typecheck:backend`      | Backend TypeScript                                                        | Backend diagnostics                                                |
| `pnpm run typecheck:storefront`   | Storefront TypeScript                                                     | Storefront diagnostics                                             |
| `pnpm run lint`                   | Repository ESLint configuration                                           | Lint diagnostics                                                   |
| `pnpm run format`                 | Rewrites supported files with Prettier                                    | Review resulting changes                                           |
| `pnpm run format:check`           | Read-only formatting check                                                | Nonzero on formatting drift                                        |
| `pnpm run test`                   | Alias of `test:unit`                                                      | Fast unit/domain/lifecycle simulation results                      |
| `pnpm run test:unit`              | `tests/unit`                                                              | Does not run real database/browser acceptance                      |
| `pnpm run test:watch`             | Vitest watch mode with repository configuration                           | Interactive reruns; Ctrl+C stops                                   |
| `pnpm run test:storefront:unit`   | `apps/storefront/lib`                                                     | Storefront library results                                         |
| `pnpm run test:coverage`          | Unit suite, pure-domain 90% coverage gates                                | `coverage/` HTML/LCOV and console report                           |
| `pnpm run test:errors`            | Dedicated error suite and coverage configuration                          | Error coverage report; separate from `test:all`                    |
| `pnpm run test:frontend:coverage` | Unit suite, backend action/client-request coverage selection              | Coverage report                                                    |
| `pnpm run test:integration`       | Creates isolated embedded PostgreSQL; accepts test paths                  | Migration/transaction/authorization results                        |
| `pnpm run test:browser`           | Builds/starts disposable production browser fixture                       | Playwright results and failure traces                              |
| `pnpm run test:e2e`               | Alias of the same browser fixture runner                                  | Same scope as `test:browser`                                       |
| `pnpm run test:storefront`        | Separate backend/storefront fixture; accepts Playwright test paths        | Cross-service browser results                                      |
| `pnpm run test:browser:existing`  | Direct Playwright against `PLAYWRIGHT_BASE_URL` (default localhost:3001)  | Mutates the selected test store; provisions no services            |
| `pnpm run test:containers`        | Docker image builds and disposable Compose acceptance                     | Container/service/recovery results; fixture cleanup                |
| `pnpm run test:all`               | Types, lint, formatting, unit, storefront libraries, integration, browser | Stops at first failure; excludes errors, containers and benchmarks |

For focused selection, for example:

```bash
pnpm exec vitest run tests/unit/public-origin.test.ts
pnpm run test:integration tests/integration/auth-session-isolation.test.ts
pnpm run test:storefront tests/browser/session-isolation.spec.ts
```

Direct browser tests create orders, users and settings: select only a disposable
synthetic store. Fixture logs, traces and temporary workspaces can contain
synthetic access tokens; do not publish raw artifacts without review.
Unfiltered `test:watch` includes integration files under the Vitest configuration;
use `pnpm run test:watch tests/unit` for a database-free unit watch session.
`test:browser`, `test:e2e` and `test:storefront` currently share the same
two-service fixture runner; they are not three independent acceptance suites.
Use `pnpm exec vitest run <file>` for a focused unit test. Adding a file to
`test:unit` retains its existing `tests/unit` positional filter and therefore
still selects the entire unit directory.

## Database and owner operations

| Command                                                                                      | Inputs and effects                                                                                                                                                                     | Result                                                                                                      |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm run db:init supastore_dev`                                                             | Optional database name; prompts if omitted. Requires administrator database-creation rights. Creates/preserves that database, migrates and seeds synthetic data with delivery disabled | Demo owner/catalog; does not change `.env` or storage                                                       |
| `pnpm run db:migrate`                                                                        | `MIGRATION_DATABASE_URL`, falling back to `DATABASE_URL`; optional app-role credentials                                                                                                | Applies migrations and refreshes runtime grants; changes selected database                                  |
| `pnpm run db:generate`                                                                       | Drizzle schema/configuration                                                                                                                                                           | Generates migration files for review; does not deploy them                                                  |
| `pnpm run db:studio`                                                                         | Configured database                                                                                                                                                                    | Interactive database access; edits affect that database                                                     |
| `pnpm run db:seed`                                                                           | `DEMO_SEED=true` or `M1_DEMO=true`; migration-capable `DATABASE_URL`; optional `DEMO_OWNER_PASSWORD`                                                                                   | Migrates/seeds synthetic owner, settings and catalog; never a production bootstrap                          |
| `pnpm run auth:recover-owner --email=owner@example.test --baseUrl=https://shop.example.test` | Trusted terminal, explicit target database; base URL optional (uses configured origin)                                                                                                 | Creates/restores verified active owner and prints a single-use 15-minute login URL; does not set a password |

Owner provisioning and recovery are privileged mutations. Follow the
[first-owner recipe](operator-cookbook.md#provision-the-first-owner), including
normal password setup and session verification. Connection URL passwords must
be URL-encoded. A successful migration is not a backup or rollback.

## Fixtures, probes and measurements

| Command                                             | Prerequisites and effects                                                                             | Result                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:postgres`                            | Dedicated persistent embedded fixture at `.test-postgres`, localhost:55432; no production credentials | Runs until Ctrl+C; retains fixture data                                                                          |
| `pnpm run test:storage`                             | In-memory unauthenticated S3 protocol fixture on loopback `TEST_STORAGE_PORT` (default 9000)          | Runs until Ctrl+C; objects disappear at shutdown; not a real storage acceptance test                             |
| `pnpm run check:services`                           | Reads selected provider configuration                                                                 | Sanitized JSON configuration report; no connection probe                                                         |
| `pnpm run check:services --connect`                 | Contacts configured Stripe/SMTP services for authentication/connectivity                              | JSON report; no message or payment is sent; not delivery/settlement acceptance                                   |
| `pnpm run bench:search`                             | Explicit isolated `DATABASE_URL` ending `/supastore_test`; migrated schema                            | Inserts 10,000 benchmark products, measures search and removes matching benchmark products; modifies the fixture |
| `pnpm run bench:memory`                             | Production two-service fixture and browser prerequisites                                              | App-process resource artifacts; excludes DB/browser RSS                                                          |
| `pnpm run bench:memory:analyze path/to/memory.json` | Protocol-v1 JSON artifact, at most 8 MiB                                                              | JSON analysis; exit 0 pass, 2 budget failure, 1 invalid input                                                    |
| `pnpm run bench:fixture`                            | Integration fixture prerequisites                                                                     | Benchmark-fixture integrity tests                                                                                |
| `pnpm run bench:representative`                     | Dedicated production benchmark fixture                                                                | Standard representative run; see benchmark protocol for duration/artifacts                                       |
| `pnpm run bench:storefront`                         | Completed storefront build; optional `STOREFRONT_DIST_DIR`/`NEXT_DIST_DIR`                            | Bundle-budget JSON; exit 0 pass, 2 over budget, 1 unreadable build                                               |

Use [representative benchmark](representative-benchmark.md) and
[memory diagnosis](memory-diagnosis.md) for benchmark options and interpretation.
Historical measurements do not establish target-host capacity. `test:storage`
cannot share port 9000 with local RustFS.

## Shell backup and restore

These are scripts rather than package commands. Use Bash, compatible PostgreSQL
clients, Node and `sha256sum`. They act on explicitly selected databases:

```bash
bash scripts/backup.sh ./backups/store-snapshot
bash scripts/restore.sh ./backups/store-snapshot "$RECOVERY_DATABASE_URL"
```

Backup requires exported `DATABASE_URL` and an empty/new destination. Restore
requires `RESTORE_COLD_CONFIRMED=true`, stopped target clients and an isolated
target; it replaces database contents, verifies directory checksums and runs
migrations. Object storage is a separate matching backup. Follow the
[recovery cookbook](operator-cookbook.md#back-up-and-rehearse-a-cold-restore)
and [disaster recovery playbook](playbooks/disaster-recovery.md) before use.
