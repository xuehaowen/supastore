# System maintenance guide

Snapshot: 2026-10-09. Use the [capability inventory](system-capabilities.md) for system behavior and the directory READMEs linked from [backend source](../src/README.md), [applications](../apps/README.md), and [shared packages](../packages/README.md) for module details. This guide covers maintenance across those modules. Commands below come from the current root `package.json` and repository scripts. Review configuration and the target database before running commands that migrate, seed, restore, or contact providers.

## Combined application sitemap

The combined application serves `/sitemap.xml` as a streamed index. Its child
routes are `/sitemaps/static.xml` and `/sitemaps/{resource}-{page}.xml`, where
resource is `products`, `collections`, or `categories`. Each resource page reads
at most 1,000 projected records ordered by ID and emits both supported locales.
Unpublished products and collections are excluded. Static content links preserve
the configured locale fallback. The index rejects more than 50,000 child pages
instead of silently truncating discovery. Responses allow 30 seconds of public
caching. Publication changes can shift pages between requests; these are live
discovery documents, not a historical snapshot.

## Manual order retries

Manual-order forms generate a request UUID when the dialog opens. Retries of the
same submitted request recover its original order, including after ordering is
paused. The identity is bound to the owner and normalized customer, destination,
payment method and item details; changing those details requires a new request.
Cart preparation, quoting and placement share one transaction, so failures leave
no partial preparation. Opening a new dialog starts a distinct request.

## Financial reports and dashboard

Sales reports show 100 rows per page while totals cover the complete requested
period. Sources are read through PostgreSQL cursors in batches of 500 and staged
in a transaction-local temporary table. Earlier refund history also counts toward
the source budget because it determines cumulative allocation. Exceeding a budget
fails the report instead of returning incomplete financial totals.

The default budgets are `REPORT_MAX_SOURCE_ROWS=100000` (range 1–1,000,000),
`REPORT_MAX_EXPORT_BYTES=67108864` (1–256 MiB), and `REPORT_TIMEOUT_MS=30000`
(1–300 seconds). Time and cancellation are checked between queries and batches;
an active SQL statement is separately bounded by the runtime statement timeout.
Report work and index maintenance each use a local 4 MiB PostgreSQL memory budget.

Financial CSV exports prepare the complete repeatable-read snapshot in a private,
exclusively created temporary file before returning a response. Downloads use
64 KiB byte-based backpressure without holding a database transaction open. Files
are removed on completion, failure, or cancellation; a process crash can leave
an orphan in the operating-system temporary directory. Measure disk capacity and
concurrent reporting load on the target deployment before increasing budgets.
Rerun runtime-role provisioning through the migration runner to grant temporary
table access; persistent database object ownership remains forbidden.

The dashboard uses the same canonical sales rows. Its 30-day window follows the
merchant's calendar and purchase confirmation dates. Net sales include refunds
and outside adjustments and exclude tax. Average confirmed purchase includes
tax; confirmed purchase units count original confirmed order quantities. The
seven-day chart includes negative net days. Threshold evaluation reads a snapshot
before taking a short settings lock to revalidate the policy and fiscal period.

## Catalog selectors, histories, and exports

Manual-order and slot-quota variant selectors load at most 50 initial options.
Use the SKU/product search to find other variants; the search is owner-only,
returns up to 50 matches, and preserves selections while searching. Existing
slot quota labels are loaded with their quota records, independently of this
initial batch. Customer credit history uses a separate `creditPage` parameter
with 25 entries per page. Reconciliation always checks the complete ledger.

CSV exports fetch bounded batches using `(created_at, id)` cursors with full
PostgreSQL timestamp precision, and a creation-time cutoff captured when the
export starts. The HTTP response pulls chunks on demand and cancels the source
on disconnect. This is a live export with a creation-time cutoff: it does not
provide a database snapshot of fields, deletions, or transactions committed
later with older timestamps. Use a cold database copy for an exact historical
snapshot. Product export rows are ordered by variant creation time and ID.

XLSX exports support up to 10,000 data rows and the spreadsheet's 32,767-character
cell limit. Larger exports return a readable HTTP 422 response directing the
merchant to the streaming CSV download. XLSX generation is bounded but still
uses an in-memory workbook.

## Request and database resource budgets

The separate storefront caches common catalog first pages, published product
reads and store settings with 30-second revalidation, without customer cookies.
Searches, filters, later catalog pages and unexpected query parameters stay
uncached to bound cache-key growth. Private carts, checkout, orders and accounts
continue to read current state. Revalidation serves stale content while it
refreshes and can retain stale public content during a backend outage; accepted
quotes and mutations always use current backend state.
Recovery cutovers must replace the storefront's public data cache before traffic
resumes, so cached product identifiers from another database are not reused.
The separate-service test runner isolates cache/build output and generated
TypeScript configuration per synthetic database.

The separate storefront's `/sitemap.xml` is a streamed index of
`/sitemaps/{page}.xml` files. Discovery reads only published product handles,
at most 1,000 per API request. Each XML page contains up to 2,002 bilingual URLs,
including the two home URLs on the first page. Publication changes can move
records between pages during a crawl. The combined application's existing
category/collection sitemap still needs migration to this paged structure.

Storefront JSON reads and writes have a 15-second deadline covering connection,
headers and response-body reads. Responses are limited to 2 MiB, using both the
advertised length and actual decoded bytes. Timeout and oversized-body failures
cancel the transport and use the existing typed error boundary. Bounded backend
request IDs are retained on errors for correlation; requests are not retried
automatically.
Unexpected commerce API failures use the existing structured logger with the
same request ID returned in the response, while public errors retain a generic
message.

Runtime database connections default to a pool of 10, a 30-second statement
timeout, a 5-second lock wait, and a 60-second idle-transaction timeout. Configure
these with `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS`, and
`DB_IDLE_TRANSACTION_TIMEOUT_MS`. Pools are limited to 1–20 connections;
statement/idle budgets to 1–300 seconds; lock waits to 100–300,000 milliseconds.
The lock budget cannot exceed the statement budget. Invalid configuration fails
at startup. Migrations use their separate operator connection and are not given
these runtime budgets. Budget total connections across all backend instances.

## Establish the current state

Start with the relevant directory README, current diff, deployed image revision, environment configuration, and migration journal. Determine whether the problem affects the combined app, separate storefront, backend, worker, storage, or provider. Record the request/order/reference and timestamps without exposing private access tokens or credentials.

Documentation priority is explicit: scope/workflows/transactions/schema/events own intended rules; code and migrations show implementation; automated checks and dated release evidence show tested outcomes. Plans explain history/dependencies and are not an inventory of shipped functionality. Resolve discrepancies deliberately; do not copy historical test counts or resource estimates into current release claims.

## Development and verification commands

| Purpose                        | Command                                                           | What it establishes                                                                                               |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Install                        | `pnpm install --frozen-lockfile`                                  | Reproducible locked dependencies                                                                                  |
| Combined development           | `pnpm dev`                                                        | Root Next application, including customer/admin/API routes                                                        |
| Separate development           | `pnpm dev:backend` and `pnpm dev:storefront`                      | Backend on 3000 and storefront on 3001 by default                                                                 |
| Backend/root types             | `pnpm typecheck`                                                  | Root TypeScript compilation checks                                                                                |
| Separate storefront types      | `pnpm typecheck:storefront`                                       | Storefront compilation checks                                                                                     |
| Fast unit/domain suite         | `pnpm test` or `pnpm test:unit`                                   | `tests/unit`, including the synthetic lifecycle simulation                                                        |
| Storefront libraries           | `pnpm test:storefront:unit`                                       | HTTP proxy, trusted ingress, amounts, analytics tests                                                             |
| Real PostgreSQL integration    | `pnpm test:integration`                                           | Isolated embedded database, migrations and transactional workflows                                                |
| Main browser journeys          | `pnpm test:browser` or `pnpm test:e2e`                            | Script-managed production browser fixture                                                                         |
| Cross-service journeys         | `pnpm test:storefront`                                            | Separate production builds, synthetic backend/local SMTP/storage fixture                                          |
| Existing-server browser checks | `pnpm test:browser:existing`                                      | Direct Playwright invocation; inspect fixture assumptions first                                                   |
| Combined verification          | `pnpm test:all`                                                   | Both type checks, unit suites, integration and browser commands; excludes lint, coverage and container acceptance |
| Lint/format                    | `pnpm lint`, `pnpm format:check`                                  | Source style/static checks; use targeted Prettier for a small documentation change                                |
| Domain coverage                | `pnpm test:coverage`                                              | 90% lines/statements/functions/branches for `src/domain/**/*.ts`; not whole-system coverage                       |
| Builds                         | `pnpm build:backend`, `pnpm build:storefront`                     | Both application production builds                                                                                |
| Container acceptance           | `pnpm test:containers`                                            | Disposable container acceptance runner; inspect its fixture/project scope                                         |
| Service configuration          | `pnpm check:services`                                             | Configuration report without connectivity probing                                                                 |
| Provider connection probe      | `node scripts/check-release-services.mjs --connect`               | Connection/authentication probe; not recipient receipt or live payment acceptance                                 |
| Measurements                   | `pnpm bench:storefront`, `pnpm bench:memory`, `pnpm bench:search` | Build/configuration-specific bundle, memory and search evidence                                                   |
| Database tooling               | `pnpm db:migrate`, `pnpm db:generate`, `pnpm db:studio`           | Migrations/schema tooling against the configured target                                                           |
| Synthetic demo                 | `pnpm db:seed` with documented demo flags                         | Demo records only; never point it at production customer data                                                     |
| Owner recovery                 | `pnpm auth:recover-owner`                                         | Trusted recovery tooling; read script and governance contract before use                                          |

The isolated integration runner currently uses loopback port 25438. Fixture ports/selection can change; inspect runner source when diagnosing conflicts. A passing domain simulation is not a browser journey, database concurrency test, or provider acceptance test.

## Configuration map

| Surface           | Configuration/source                                                                                   | Maintenance concern                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend runtime   | `.env.example`, `infrastructure/config.ts`, `DATABASE_URL`, `ADMIN_SETUP_SECRET`, `BETTER_AUTH_SECRET` | Core config validation is only part of validation; individual adapters validate their own settings. Use direct/session-compatible PostgreSQL connections for full transaction locks. |
| Public identity   | `APP_URL`, `BETTER_AUTH_URL`, `STOREFRONT_ORIGIN`                                                      | Keep browser origin, cookie/auth links and provider callbacks coherent. Local separate setup uses public port 3001.                                                                  |
| Storefront server | `BACKEND_URL`, optional `EDGE_PROXY_SECRET`                                                            | Backend target also participates in compiled rewrites; update build arguments when hostname changes. No database/SMTP/storage/Stripe secrets on storefront.                          |
| Object storage    | `S3_ENDPOINT`, region, public/private buckets, access keys                                             | Browser presigned URLs must reach the configured storage endpoint. Preserve private immutable evidence and public catalog objects during backups.                                    |
| Email             | `EMAIL_PROVIDER`, SMTP connection/auth/TLS values; OAuth client/secret/refresh token if selected       | `nodemailer`, `nodemailer-oauth2`, or disabled. Restart after profile/credential changes and reconcile pinned pending messages.                                                      |
| SMS/verification  | Selected providers and backend-only Telnyx key/from/profiles/public key                                | Configuration does not enable live sending; composition-root authorization remains off.                                                                                              |
| Stripe            | Secret key and webhook secret                                                                          | Configure public signed callback path and supported store currency units. Redirects cannot confirm payment.                                                                          |
| Carrier gateway   | Provider and webhook secret                                                                            | Signed timestamp-bounded gateway callbacks only; no carrier labels/rate engine implied.                                                                                              |
| Worker            | `ENABLE_OUTBOX_WORKER`, `DISABLE_OUTBOUND_DELIVERY`                                                    | Worker only on backend; suppress outbound during isolated recovery. Confirm suppression reaches the actual process environment.                                                      |
| Merchant policies | Store settings persisted in PostgreSQL                                                                 | Enabled fulfillment, guest policy, rewards/tax, zones/locations/areas, deadlines and content are store data, not merely environment variables.                                       |

Rate limiting is layered. In-memory limits are process local; sensitive database checks and verified ingress must protect multi-replica deployments. The storefront proxy strips untrusted client IP headers. Without an authenticated edge contract, unrelated clients can share backend/proxy rate-limit buckets. Configure the selected ingress explicitly; forwarding arbitrary supplied IP headers is not a fix.

## Change workflow

1. Identify the owning module and contract. Trace every route/action calling the affected use case, including both customer interfaces and background reconciliation paths.
2. Write down invariants affected: actor scope, amount/source caps, purchase snapshot, stock/credit/slot reservation, terminal state, callback identity, or template version.
3. Inspect all affected transactions and direct locks. The shared lock helper cannot enforce callers; base/extension contract summaries have historical differences. Establish a consistent order across every competing writer before editing financial operations.
4. Keep the command in one application implementation. Persist state, required audit/event and request identity together; perform provider/storage I/O outside financial transactions. Recheck state and ownership after locking.
5. Add a forward migration for persistence changes. Inspect SQL and the migration journal; do not regenerate or amend an applied financial-history migration. Test both clean creation and forward upgrade.
6. Update shared serializable contracts when needed, API parsing, and both UIs. Revalidate checkout against the authoritative backend regardless of cached catalog output.
7. Run the focused relevant tests and types; expand to integration for persistence/races and browser checks for changed interactions or proxy boundaries. Run release-wide/container gates when releasing or changing deployment/runtime behavior.
8. Update the owner specification, capability inventory and owning directory README if behavior changed, merchant instructions, and dated evidence with actual commands/results and synthetic/live limitations.

### Changes needing special care

- Money: integer minor units and supported precision; use the canonical projection. Do not add an editable balance or equate purchase refund with unpaid purchase.
- Retry behavior: use stable actor/command request identity and persisted provider intent. Never retry an uncertain external payment as a new movement.
- Funding corrections: preserve settled transfers and original-source evidence; unsupported receiving-account reassignment stays under investigation.
- Stock/scheduling: placement, cancellation, rescheduling and dispatch must coordinate reservations under the same lock rules. Manual deadlines do not establish nonpayment.
- Rewards: preserve accepted policy/source snapshots and release only after complete fulfillment. Do not infer rewards for historical orders.
- Templates: register event/audience/channel/variables, add bilingual defaults and a seed migration, run event coverage tests. Published content and prepared messages remain immutable.
- New adapters: follow [provider adapters](provider-adapters.md), including rejection/uncertainty, identity/profile and callback tests. Adding a factory must not change business rules or imply live authorization.

## Diagnostic entry points

| Symptom                               | Start here                                                                                           | Preserve/check before intervention                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Checkout total changes/rejected       | `get-quote.ts`, `create-order.ts`, commerce settings and destination matching                        | Quote expiry/cart revision/current product and policy values; require replacement acceptance |
| Duplicate submission or response loss | Source cart/order unique constraint and operation request identity                                   | Retrieve the original authorized result before asking for another payment                    |
| Cannot confirm                        | `confirm-order.ts`, canonical financial projection, evidence/fulfillment holds                       | Exact funding, unresolved returns/corrections, timing, credit and provider outcome           |
| Stock unavailable despite count       | Stock reservations, pending review, shipment quantities, slot quota                                  | Physical count versus active reservations; no automatic manual-order timeout release         |
| Stripe return page but unpaid         | Signed inbox, checkout reconciliation, provider attempt state                                        | Authoritative provider facts; browser redirect is insufficient                               |
| Customer cannot see order             | Session/customer UUID, scoped guest proof, API/proxy cookies                                         | Never bypass ownership with email/reference matching                                         |
| Evidence upload fails                 | Origin guard, upload intent, S3 accessibility, object validation, finalization                       | Retain finalized private evidence; distinguish staging from final keys                       |
| Refund blocked                        | Source allocation, verified destination, exclusive attempt/late-evidence review                      | Actual transfer evidence and unresolved external outcome; avoid duplicate payout             |
| Credit/reward seems missing           | Source lots, active reservations, debt, funding-review flag, completion                              | Available versus reserved/unreconciled balance and original accepted policy                  |
| Email missing                         | Published template/completeness, outbox/delivery attempts, selected provider, suppression, SMTP logs | Accepted versus delivered/uncertain; repair only eligible unsent template reviews            |
| SMS not sent                          | Composition-root live authorization, consent, verification/profile and policy                        | Live sending is disabled by design in this snapshot                                          |
| Cross-service auth/origin failure     | Public origin values, backend proxy, Set-Cookie and Origin preservation                              | Both browser and SSR context; test foreign/missing/cross-site rejection                      |
| Worker stalls                         | Worker health, instrumentation enablement, leases, busy batch, provider timeout                      | App readiness alone does not prove queue progress; stale acknowledgments must stay fenced    |
| Sales numbers disagree                | Sales report inputs, fiscal period, refund component/tax history                                     | Distinguish sales, surplus returns, funding shortfall and payout-error loss                  |

Use [outbox reconciliation](playbooks/outbox-reconciliation.md) as an investigation starting point, but compare historical SQL examples with current delivery/attempt schema before executing them. Do not mark an uncertain submission unsent or bulk requeue accepted messages merely to clear a queue.

## Deployment, migration and recovery

The current container deployment has `backend`, `storefront`, `migrate`, PostgreSQL and S3-compatible storage. Only storefront publishes the application; it proxies API/auth/admin and admin assets. Backend owns the worker. Migrations are separate from startup.

Use [two-service deployment](two-service-deployment.md) for exact origin/build settings and [development/deployment](development-deployment.md) for supervision. The checked-in migration chain reaches `0036_notification_templates.sql`; match the deployed image and journal, not merely the filename. Apply compatible additive migrations before starting dependent application images.

Before an upgrade, back up database and assets, retain the current image/revision and configuration, and rehearse on an isolated restored copy. Keep outbound delivery suppressed there. Verify migration continuity, financial history, reservations, provider intents, template pinning, ownership and service readiness. Roll back application images only to schema-compatible versions; do not delete durable financial/provider history to force compatibility.

The [disaster recovery playbook](playbooks/disaster-recovery.md) and `scripts/backup.sh`, `restore.sh`, `restore-check.ts` cover database/assets restore and integrity checks. Shell scripts need a compatible shell environment on Windows. Ensure `DISABLE_OUTBOUND_DELIVERY=true` is actually passed to restored backend/worker containers, rather than assuming a shell variable is forwarded by Compose. Reconcile durable outbound state before re-enabling delivery; restore can include accepted messages and uncertain attempts.

Use the disposable project defined by `scripts/compose.smoke.yml` for container rehearsals; inspect runner scope before cleanup. Avoid applying fixture cleanup commands to a merchant's active Compose project or volumes.

## Release evidence and remaining external checks

The repository contains local synthetic integration/browser/container/load/restore evidence. This documentation update does not claim those checks were rerun or that production migration 0036 was applied.

Production acceptance still needs real Stripe configuration and payment/refund receipt verification, SMTP receipt in real inboxes, public TLS/callback/origin validation, trusted ingress limits, production-copy migration/restore rehearsal, and hosting/domain cutover. Optional SMS remains disabled and requires a separate authorized activation decision and provider acceptance. Use deployment-specific measurements for image/memory/bundle claims.

## Documentation upkeep

Keep behavior defined in its owner document and link from summaries. This capability snapshot should change when an interface/module ships, becomes gated, or is removed. Module entries should retain a real implementation path, storage ownership, key invariant, and meaningful test pointer. Dated evidence should record the build/revision, command, selection, environment and limitation; never combine counts from overlapping suites.

The README is the entry point. Historical plans/reviews remain useful context, especially the [generic implementation plan](../plans/generic-store-implementation.md), [commerce plan](../plans/lightweight-commerce-implementation.md), [customer/admin validation plan](../plans/customer-admin-e2e-validation.md), and [2026-10-08 customer review](storefront-customer-review-2026-10-08.md). The [2026-10-09 update](storefront-customer-journey-updates-2026-10-09.md) supersedes resolved findings; outstanding support-managed/deferred capabilities must remain explicit.
