# Release roadmap

This roadmap combines application milestones and operational release checklists. Current verified status is recorded in [generic-store validation](generic-store-validation.md); checkbox history alone does not certify a production launch. Scope, states, calculations and delivery semantics are owned by [product scope](product-scope.md), [workflows](business-workflows.md), [transaction contracts](transaction-contracts.md) and [events](api-events-spec.md); the tasks below implement those contracts. Performance numbers are provisional targets, not measured capabilities; record the tested configuration and revise budgets from evidence before release. Complete milestones through runnable evidence and user outcomes. Build one complete lifecycle early; add only the schema needed by its slice.

## Milestone dependencies

| Milestone | Prerequisite                                 | Outcome and release status                                 |
| --------- | -------------------------------------------- | ---------------------------------------------------------- |
| M0        | Design contracts                             | Protected synthetic lifecycle; no live use                 |
| M1        | M0, including private-use-case authorization | Storefront/admin demonstration and C1–C10; no live use     |
| M2        | M1                                           | Daily operations, C11/C12 and financial exception handling |
| M3        | M2                                           | Deployment, recovery, pilot and all release evidence       |

Task checkboxes track implementation, not alternative specifications. Section-level contract links supply requirements; verification items identify evidence to collect. Keep every gate open until runnable evidence exists. M0–M3 are milestones; parenthesized M1–M6 references identify merchant journeys in the [acceptance catalog](critical-user-journeys.md).

## M0 — Foundations and one complete synthetic order

### Scaffolding & Core Toolchain

- [x] **Select license and contribution terms**
  - _Details:_ Establish MIT License in [LICENSE](../LICENSE), document security status in [SECURITY.md](../SECURITY.md), and set contribution standards in [CONTRIBUTING.md](../CONTRIBUTING.md).
  - _Verification:_ All governance documents present, clear, and linked from README.
- [x] **Configure private vulnerability reporting**
  - _Details:_ Enable a private reporting channel, name a responsible maintainer and document the response process in [SECURITY.md](../SECURITY.md).
  - _Verification:_ Verify the channel works before the first public application release.
- [x] **Initialize package and runtime environment**
  - _Details:_ Create root `package.json` pinned to Node.js 22 LTS, pnpm, Next.js 15 with App Router and `output: 'standalone'`, React 19, and TypeScript 5.7+ with strict mode enabled (`noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`).
  - _Verification:_ Run `pnpm build` and `pnpm tsc --noEmit` cleanly with zero type errors.
- [x] **Configure Drizzle ORM and PostgreSQL driver**
  - _Details:_ Set up `drizzle-orm` with `postgres.js` driver in `apps/backend/src/infrastructure/db/`. Create `drizzle.config.ts`, migration generator/runner scripts (`pnpm db:generate`, `pnpm db:migrate`), and connection pooling with session isolation for transactional row locks (`SELECT ... FOR UPDATE`).
  - _Verification:_ Execute migration runner against a local PostgreSQL instance; verify connection lifecycle and connection-pinned transaction rollback.
- [x] **Configure Valibot schema validation**
  - _Details:_ Configure `valibot` (v1.0+) as the canonical runtime schema validation library across API endpoints, use cases, and client form inputs and measure the resulting validation bundle overhead.
  - _Verification:_ Unit test validating parsing, pipeline transformations, and error message formatting for sample payloads.
- [x] **Configure Tailwind CSS v4 and admin UI primitives**
  - _Details:_ Set up Tailwind CSS v4 (`@tailwindcss/postcss`, CSS-first `@import "tailwindcss";`), Radix UI primitives, Lucide React icons, and utility helpers (`cn`) isolated under `/admin` route layouts without leaking styles to public customer bundles.
  - _Verification:_ Build check confirms admin CSS is bundled separately from public customer storefront RSC routes.
- [x] **Configure Vitest and automated test harness**
  - _Details:_ Set up Vitest (`vitest.config.ts`) for fast ESM unit testing. Configure test helper scripts with Docker PostgreSQL or Testcontainers for integration tests requiring real transactional row locks and advisory locks.
  - _Verification:_ `pnpm test` passes sample unit and database integration tests; record runtime and database startup cost separately.
- [x] **Environment configuration template and startup validation**
  - _Details:_ Create `.env.example` defining `DATABASE_URL`, `ADMIN_SETUP_SECRET`, `S3_*`, and `SMTP_*`. Validate URLs through shared configuration helpers (`packages/config/`), with database and authentication modules rejecting missing credentials or invalid production secrets at their respective entry points.
  - _Verification:_ Server fails boot with human-readable errors when mandatory environment variables are omitted.

### Slice M0 Data Model & Drizzle Schema

Contract: [Data model](database-schema.md). Add only the entities required by this slice; exact columns and constraints belong there.

- [x] **Store settings schema (`store_settings`)**
  - _Verification:_ Drizzle migration generates table with check constraints preventing invalid currency codes or negative precision.
- [x] **Staff memberships schema (`staff_memberships`)**
  - _Verification:_ Migration prevents orphan memberships; the owner-management transaction prevents removal of the last active owner.
- [x] **Minimal product & variant schema (`products`, `product_variants`)**
  - _Verification:_ Migration enforces nonnegative integer prices (`CHECK (price_cents >= 0)`), including zero-priced products, and unique handles/SKUs.
- [x] **Cart & guest cart items schema (`carts`, `cart_items`)**
  - _Verification:_ Enforce `UNIQUE (source_cart_id)` on `orders` with a non-null foreign key to `carts.id`. Under the source-cart lock, persist the order and `converted_order_id` together. Race same-key and different-key submissions and verify they recover one authorized order.
- [x] **Quote calculation snapshot schema (`quotes`)**
  - _Verification:_ Assert immutable quote persistence; verify expired quotes cannot be used to instantiate orders.
- [x] **Orders & order items schema (`orders`, `order_items`)**
  - _Verification:_ Unique constraint on `source_cart_id` and unique index on `reference_code`.
- [x] **Payment accounts & receipts schema (`payment_accounts`, `payment_receipts`)**
  - _Verification:_ Unique index on `(payment_account_id, reference_normalized)` preventing duplicate receipts for the same bank transaction.
- [x] **Refund authorizations & payout allocations schema**
  - _Verification:_ Verify allocation sums under shared order/receipt locks, with owned foreign keys and nonnegative row checks; a row check alone cannot enforce a multi-row authorization total.
- [x] **Verified original-source payout destinations**
  - _Verification:_ Reject claims without verified source evidence or with another receipt's destination. Preserve the destination on retry and settlement; an unresolved attempt cannot be redirected. Verify cash recipient acknowledgment separately.
- [x] **Transactional outbox & deliveries schema (`outbox_events`, `event_deliveries`)**
  - _Verification:_ Partial index on `(status, retry_after) WHERE status IN ('pending', 'retrying')` and measured polling latency. Persist the versioned envelope, per-order sequence, unique business event key and unique event+recipient+channel identity required by the events contract.
- [x] **Operation requests schema (`operation_requests`)**
  - _Verification:_ Unique constraint on `(request_key, actor_scope, action)` preventing double-submission races.

### Pure Domain Logic & Financial Contracts

Contract: [Transaction contracts](transaction-contracts.md), including every required financial example and shared lock ordering.

- [x] **Pure integer minor-unit arithmetic and calculations**
  - _Verification:_ Table-driven tests verifying calculations with zero pennies discrepancy across hundreds of fractional rate scenarios.
- [x] **Canonical financial projection engine**
  - _Verification:_ Implement test suite asserting all 10 canonical accounting rules from [transaction contracts](transaction-contracts.md).
- [x] **Transaction locking order manager**
  - _Verification:_ Concurrency tests simulating inverted lock attempts; verify locks are always acquired in strictly ascending order without deadlocks.

### Authentication prerequisite for private endpoints

Contract: [Authorization boundary](architecture-overview.md#authorization-boundary). Complete before exposing private endpoints.

- [x] **Better-Auth integration with PostgreSQL session storage (`M4`)**
  - _Verification:_ Anonymous private requests fail, authenticated sessions persist in PostgreSQL, and logout blocks the next private request.
- [x] **In-transaction role and status verification (`M4`)**
  - _Verification:_ Staff cannot perform owner-only commands; deactivation blocks the next request without waiting for cached token expiry. No private endpoint is exposed before these checks pass.

### Transactional Use Cases & Worker Slice

- [x] **`bootstrapOwner` use case**
  - _Details:_ Atomic first-boot use case verifying `ADMIN_SETUP_SECRET`, initializing `store_settings`, creating the initial owner user in `staff_memberships`, and permanently disabling setup bootstrap.
  - _Verification:_ Calling `bootstrapOwner` a second time fails with 403 Forbidden.
- [x] **`getQuote` use case**
  - _Details:_ Application quote use case locking the cart, evaluating current variant prices, computing taxes, snapshotting items and calculations into an immutable `quotes` record with 15-minute TTL.
  - _Verification:_ Quote reflects exact price; updating product price after quote creation does not alter the generated quote snapshot.
- [x] **`createOrder` use case**
  - _Details:_ Transactional command converting a valid quote into an unpaid `orders` record before showing payment details. Generates Crockford Base32 checksummed `reference_code` (`SP-XXXX`) with bounded collision retry, locks source cart, updates `converted_order_id`, and emits `order.submitted` outbox event.
  - _Verification:_ Multiple simultaneous requests with same cart ID yield exactly one created order; second request returns the existing order.
- [x] **`recordReceipt` use case**
  - _Details:_ Staff command taking order ID, payment account ID, amount, and reference. Locks order with `SELECT ... FOR UPDATE`, inserts `payment_receipts`, recomputes financial projection, returns the derived payment balance, and persists audit/request results plus applicable events from the event catalog in the same transaction.
  - _Verification:_ Rejects amounts $\le 0$; rejects duplicate normalized reference for the same payment account.
- [x] **`confirmOrder` use case**
  - _Details:_ Command confirming an order only when net received equals purchase total $P$. Freezes funding snapshots ($F_i$), updates lifecycle status to `confirmed`, and emits `order.confirmed` event.
  - _Verification:_ Rejects confirmation if received amount is less than $P$ or if open surplus returns exist.
- [x] **`fulfillOrder` use case**
  - _Details:_ Staff command enforcing the workflow transition prerequisites under the order lock. Shipment emits `fulfillment.shipped`; pickup handoff or manually recorded delivery atomically sets fulfillment to `fulfilled`, order lifecycle to `completed`, and emits `order.completed`.
  - _Verification:_ Rejects fulfillment if order is not in `confirmed` status.
- [x] **`authorizeRefund` and `reconcilePayout` use cases**
  - _Details:_ Owner command authorizing full/partial original-source refund capped by available receipt capacity $\max(0, R_i - A_i)$. Creates `payout_allocations` and executes `claimPayout` with exclusive single-sender lock, followed by `reconcilePayout` to record settled outgoing transfer.
  - _Verification:_ Verifies that refund cannot exceed original receipt funding and concurrent payout claims block duplicate execution. Claims require an immutable verified original-source destination revision; unverified or mismatched destinations fail, and retry retains the same destination.
- [x] **In-process transactional outbox worker loop**
  - _Details:_ Implement `apps/backend/src/infrastructure/worker/outbox.ts` running an asynchronous timer loop (e.g. 5-second interval, initialized via Next.js `instrumentation.ts` on Node runtime) polling `event_deliveries` using `SELECT ... FOR UPDATE SKIP LOCKED` inside a short claim transaction. Persist a unique lease token and expiry, enforce order+recipient+channel sequencing, commit, then call the provider outside the transaction. Only the current lease owner may acknowledge; reuse the delivery identity for provider retries.
  - _Verification:_ Spin up 3 concurrent worker processes; verify one current lease owner per delivery, stale acknowledgments rejected, expired leases recoverable and no repeated business effects. Simulate an uncertain send: reuse provider idempotency where supported and explicitly allow at-least-once email delivery otherwise.
- [x] **Mock email notification provider adapter**
  - _Details:_ Implement `MockEmailAdapter` recording sent message payloads in memory/database for test verification, logging only redacted metadata to stdout during development.
  - _Verification:_ Order submission, confirmation, and refund events generate appropriate mock email deliveries with matching template tokens.

### Verification & Exit Criteria

- [x] **Unit and domain calculation test suite**
  - _Details:_ Run Vitest suite testing integer rounding, tax splits, quote expiration, and financial projection invariant edge cases.
  - _Verification:_ 100% test pass rate on all domain calculation test files.
- [x] **Concurrency and idempotency test suite**
  - _Details:_ Run integration tests simulating lost mobile submission response (re-submission with same idempotency key), racing carts, concurrent receipt recordings, and concurrent payout claims.
  - _Verification:_ All concurrency tests pass without deadlocks or invariant violations.
- [x] **End-to-end synthetic order lifecycle test**
  - _Details:_ Automated integration test executing: Owner Setup $\to$ Product Creation $\to$ Guest Cart $\to$ Quote $\to$ Unpaid Order Placement $\to$ Manual Receipt Recording $\to$ Order Confirmation $\to$ Fulfillment Completion $\to$ Full Refund Authorization $\to$ Payout Reconciliation.
  - _Verification:_ Test completes clean full lifecycle, asserting database state at every intermediate step.

---

## M1 — A usable shop

### Storefront & Catalog Experience

- [x] **Public catalog browsing with React Server Components (RSC)**
  - _Details:_ Implement `/` (home) and `/products/[handle]` (PDP) using pure React Server Components with static generation and tag-based revalidation (`revalidateTag('catalog')`). Keep catalog rendering on the server and measure framework runtime plus interactive client code.
  - _Verification:_ Record Lighthouse results under documented mobile network/CPU throttling; identify blocking time and layout-shift regressions.
- [x] **Product variants, categories, and availability management**
  - _Details:_ Support variant attributes (size, color), category hierarchies, image asset key mapping, and instant manual availability toggles (`is_available: boolean`).
  - _Verification:_ Toggling variant availability immediately reflects on the PDP without restarting the application or rebuilding pages.
- [x] **PostgreSQL native full-text search with trigram matching**
  - _Details:_ Add stored generated `search_vector` (`tsvector`) column on products with GIN index and enable `pg_trgm` extension for typo-tolerant product search queries via Drizzle.
  - _Verification:_ Searching with slight typos (e.g. "shrit" for "shirt") returns relevant product records; benchmark against the provisional <10ms query target on a documented dataset.
- [x] **Localization with `next-intl`**
  - _Details:_ Implement multi-language routing (`/en`, `/zh`) with fallback to store default locale. Store product title/description translations in relational `product_translations` table.
  - _Verification:_ Changing language switches text seamlessly while preserving currency, active cart, and pricing.
- [x] **Customer bundle size verification (measured regression budget)**
  - _Details:_ Restrict client-side React components (`'use client'`) to minimal interactive islands (`CartDrawer`, `QuantitySelector`, `CopyButton`, `Uploader`).
  - _Verification:_ Record total gzip client JavaScript per public route, including framework runtime, against the 102 KB shared first-load baseline and relaxed 200 KB regression warning. Optimize within the current setup; this warning is not a launch restriction.

### Guest Cart & Checkout Flow

Contract: [Cart, quote and order creation](business-workflows.md#2-cart-quote-and-order-creation) and customer journeys C2–C7.

- [x] **Persistent guest cart and session recovery (`C2`)**
  - _Verification:_ Refreshing or navigating across pages retains cart items; unavailable items display clear out-of-stock badges without dropping the cart.
- [x] **Shipping zone and flat rate evaluation (`C3`)**
  - _Verification:_ Subtotal qualifying for free shipping sets shipping fee to 0 cents and displays "Free Shipping" badge.
- [x] **Pickup location and time slot selection (`C3`)**
  - _Verification:_ Selecting an invalid or past pickup slot is rejected with descriptive validation feedback.
- [x] **Zero-total order checkout path (`C7`)**
  - _Verification:_ Placing a $0 order transitions order directly to `confirmed` with zero receipts and delivers confirmation email.
- [x] **Order creation and payment reference presentation (`C4`)**
  - _Verification:_ Customer sees payment instructions only after order ID and reference code are persisted in the database.
- [x] **Idempotent checkout and lost submission recovery (`C5`)**
  - _Verification:_ Resubmitting the same checkout payload returns the original order with HTTP 200 rather than creating duplicate orders.

### Guest Access & Payment Evidence

Contract: [Payment evidence](business-workflows.md#3-payment-and-confirmation), [access recovery](business-workflows.md#8-access-recovery-and-customer-communication) and customer journeys C4–C9.

- [x] **Scoped guest session authorization token (`C4`)**
  - _Verification:_ Customer can immediately refresh or view their order status directly from the confirmation browser.
- [x] **Lost link email recovery (`C8`)**
  - _Verification:_ Magic link logs guest into order tracking session; link expires after first use or 24 hours.
- [x] **Direct S3 presigned payment evidence upload (`C6`)**
  - _Verification:_ Reject invalid candidate bytes. Overwriting staging during or after finalization cannot replace reviewed evidence; concurrent retries return one final record and cleanup cannot delete an active candidate or finalized object.
- [x] **Resilient tracking view with delivery failure visibility (`C9`)**
  - _Verification:_ Simulating failed email worker delivery leaves customer order tracking intact and flags delivery failure in `/admin`.

### Pre-Receipt Order Adjustments

Contract: [Permitted changes](business-workflows.md#4-unpaid-orders-and-permitted-changes) and C10.

- [x] **Merchant pre-receipt change proposal (`C10`)**
  - _Verification:_ Customer sees "Order Terms Updated" notification on tracking screen with explicit "Accept New Total" button.
- [x] **Customer change proposal acceptance flow (`C10`)**
  - _Verification:_ Accepting proposal creates new order version and records acceptance audit record.
- [x] **Receipt arrival race condition invalidation (`C10`)**
  - _Verification:_ Recording any receipt voids the pending proposal and retains the last accepted total. The customer sees the actual amount received and resulting balance, without implying full payment. Test partial, exact and excess receipts.

### Merchant Setup & Launch Controls

- [x] **Merchant onboarding setup wizard (`M1`)**
  - _Details:_ Guided `/admin/setup` wizard configuring store name, logo, currency, default locale, shipping zones, pickup location, tax rules, and manual payment accounts.
  - _Verification:_ Setup steps persist to `store_settings`; wizard marks setup complete upon final step.
- [x] **Launch readiness checklist (`M1`)**
  - _Details:_ Operational checklist verifying at least one published product, one active payment method, valid shipping/pickup rules, and verified email provider before store goes live.
  - _Verification:_ Disabling all payment methods flags store as not ready and prevents public order placement.
- [x] **Store emergency pause control (`M6`)**
  - _Details:_ Add "Pause New Orders" toggle in store settings. When paused, storefront displays a custom pause banner and blocks cart checkout, while allowing existing orders to be tracked, paid, and fulfilled.
  - _Verification:_ Attempting checkout while paused returns friendly "Store is currently paused" error without discarding customer cart.
- [x] **Mobile-optimized admin daily queue views (`A1`)**
  - _Details:_ Build `/admin` dashboard with segmented operational queues: "Unpaid Orders", "Payment Evidence Review", "Ready for Fulfillment", "Overdue / Abandoned", and "Failed Emails".
  - _Verification:_ Admin dashboard is fully responsive on mobile screen widths (<375px) with tap-friendly action buttons.

### Verification & Exit Criteria

- [x] **Automated Playwright customer and merchant journey tests**
  - _Details:_ End-to-end Playwright test suite running in headless Chromium covering C1–C10 and merchant journeys M1, M2, M6. Customer C11/C12 cancellation and unavailable-purchase resolution are M2 exit gates. M1 is a synthetic demonstration milestone, not ready for live merchant orders; public release still requires M2 and M3.
  - _Verification:_ 100% pass on all customer and merchant journey test scenarios.
- [x] **Accessibility and usability audit**
  - _Details:_ Execute axe-core accessibility scanner across all public customer routes; verify keyboard tab order, ARIA attributes, and screen-reader announcements for cart drawers and dialogs.
  - _Verification:_ Zero critical/serious WCAG 2.2 accessibility violations.

---

## M2 — Reliable daily operations

### Staff Governance & Security

Authentication and use-case authorization are M0 prerequisites. This milestone adds governance and recovery tooling on that foundation.

- [x] **Protected owner recovery workflow (`M5`)**
  - _Details:_ Provide CLI-based owner recovery command (`pnpm run auth:recover-owner --email=...`) requiring direct server/console access, bypassing public web endpoints.
  - _Verification:_ Recovery command promotes specified email to owner and generates a temporary one-time login URL.
- [x] **Last active owner deletion guard**
  - _Details:_ Database trigger or transaction invariant preventing deletion or deactivation of the last remaining active owner membership.
  - _Verification:_ Attempting to remove the sole active owner throws a validation error.

### Payment Accounts & Cash Reconciliation

- [x] **Payment account normalization and alias management**
  - _Details:_ Implement versioned reference normalization rules (e.g. stripping spaces, dashes, case folding) for bank account numbers, Pix keys, and PromptPay IDs.
  - _Verification:_ Entering `REF-1234-ABCD` and `ref 1234 abcd` normalize to identical canonical references.
- [x] **Cash drawer collection workflows with sequential numbering (`A2`)**
  - _Details:_ Dedicated cash receipt recording dialog generating monotonic sequential cash receipt numbers (e.g. `CASH-2026-0001`) with recorded drawer and payer identity.
  - _Verification:_ Concurrent cash receipt creations produce strictly ordered, non-overlapping sequential receipt numbers.
- [x] **Cash drawer end-of-day reconciliation reports**
  - _Details:_ Generate printable summary of all cash collected, refunds paid out, and net drawer balance per staff member and shift.
  - _Verification:_ Report matches sum of individual cash receipts and payout entries for the selected date range.

### Exact Confirmation, Surplus Returns & Cancellations

Contract: [Payment](business-workflows.md#3-payment-and-confirmation), [refunds and cancellation](business-workflows.md#6-refunds-excess-returns-and-cancellation) and [financial projection](transaction-contracts.md#canonical-financial-projection).

- [x] **Exact-payment confirmation gate (`A2`)**
  - _Verification:_ Underpayment blocks confirmation with the shortfall shown. A $40 order with $50 received and $10 excess returned can confirm only after settlement and all other gates pass.
- [x] **Surplus overpayment return authorization (`A7`)**
  - _Verification:_ Order cannot be confirmed until the excess return is authorized and resolved.
- [x] **Abandoned unpaid order review queue (`A10`)**
  - _Verification:_ Cancelling unpaid order updates status to `cancelled`, cancels fulfillment, and emits `order.cancelled` event with zero refund obligations.
- [x] **Late payment receipt on cancelled orders (`A7`)**
  - _Verification:_ Late receipt is flagged as "Return Required - Paid After Cancellation" in admin payout queue.
- [x] **Customer cancellation requests and staff resolution (`C11`, `C12`)**
  - _Verification:_ Cancelling confirmed order halts fulfillment and generates refund authorizations for purchased merchandise.

### Financial Refunds & Payout Settlement

Contract: [Payout workflow](business-workflows.md#6-refunds-excess-returns-and-cancellation) and [payout contracts and examples](transaction-contracts.md#payout-discrepancies).

- [x] **Component-level partial refund authorizations (`A6`)**
  - _Verification:_ Authorizing refund for item A reduces item A's refundable ceiling to $0 while leaving item B refundable.
- [x] **Exclusive single-sender payout claim locking (`A8`)**
  - _Verification:_ Two owner sessions clicking "Send Payout" simultaneously result in one successful claim and one "Payout already claimed by another user" error.
- [x] **Uncertain payout reconciliation workflow (`A8`)**
  - _Verification:_ System prevents re-attempting a payout without explicit operator audit resolution.
- [x] **Payout discrepancy recording and resolution (`A8`)**
  - _Verification:_ Execute every payout example in the transaction contract, including $50 paid against a $30 claim on a $50 authorization (full settlement, zero loss, claim breach), and late original-attempt evidence while a replacement is unresolved. Test proven-unsent and already-sent replacements, both reconciliation orders, concurrent claims and exact retries. Verify remaining entitlement never includes money already settled and replacement actionability changes atomically with late-evidence review.
- [x] **Supplemental returns and partial payout remainder tracking**
  - _Verification:_ A verified $30 transfer against a $50 claim yields C=30, E=0, S_i=30 and U_i=20 without a discrepancy. Evidence that no remainder is pending closes the attempt and permits a new $20 claim; an uncertain remainder blocks it. A verified full $50 transfer must classify C=50, and exact retries never increment settlement again.

### Audited Receipt Corrections & Funding Loss

Contract: [Receipt corrections](business-workflows.md#7-receipt-corrections) and [correction losses](transaction-contracts.md#correction-losses).

- [x] **Audited receipt correction cases (`A9`)**
  - _Verification:_ Correcting a confirmed $100 receipt down to $10 caps effective original funding at $10; future authorizations obey remaining entitlement and capacity after prior payouts.
- [x] **Allocation revisions and settled payout preservation**
  - _Verification:_ System does not rewrite or delete historical settled outgoing transfers.
- [x] **Operational funding loss calculation (`A9`)**
  - _Verification:_ A confirmed $100 purchase corrected to $10 after a settled $30 purchase refund shows $90 total shortfall, not $110; preserve settled history and original-source backing.
- [x] **Cross-order duplicate receipt investigation (`A9`)**
  - _Verification:_ Cross-order correction acquires locks on both orders simultaneously without deadlock and updates both order projections atomically.

### Fulfillment Operations & Packing Slips

- [x] **Thermal printer styles (58mm/80mm) for packing slips and receipts (`A3`)**
  - _Details:_ Implement dedicated print CSS stylesheets (`@media print`) and clean HTML templates optimized for standard 58mm and 80mm ESC/POS thermal receipt printers.
  - _Verification:_ Browser print preview formats packing slip perfectly within 80mm width with crisp barcodes and zero layout clipping.
- [x] **Audited fulfillment corrections (`A4`)**
  - _Details:_ Allow staff to correct shipping address typos, change carrier, or update tracking numbers on paid orders without altering financial totals.
  - _Verification:_ Address change records timestamped audit log and sends tracking update email to customer.
- [x] **Pickup handoff and manual delivery completion (`A3`)**
  - _Details:_ Complete fulfillment workflow: staff marks order "Ready for Pickup" (delivers notification), verifies the recipient using their scoped order page or owner-assisted identity verification, and records handoff actor/time before marking the order `completed`. Follow the handoff contract in [workflows](business-workflows.md#5-fulfillment); no separate pickup code is required.
  - _Verification:_ Completing fulfillment transitions fulfillment to `fulfilled` and order lifecycle to `completed` and closes active fulfillment queue item.

### CSV Import & Export Tools

- [x] **Product CSV upload with client-side Web Worker preview (`M3`)**
  - _Details:_ Implement CSV importer parsing files in a Web Worker, validating required headers (`handle`, `sku`, `title`, `price_cents`), checking for duplicate SKUs, and displaying visual diff preview (new vs updated products).
  - _Verification:_ Importing CSV with invalid rows highlights exact line numbers and syntax errors before database execution.
- [x] **Atomic product CSV import execution (`M3`)**
  - _Details:_ Execute import use case inserting new products and updating existing handles within a single transaction.
  - _Verification:_ If row 50 of 100 fails validation, the entire batch rolls back with zero partial writes.
- [x] **Read-only CSV export for products and orders (`M3`)**
  - _Details:_ Implement streaming CSV exports for products (including variants/prices) and orders (including line items, receipt references, and fulfillment states).
  - _Verification:_ Exported product CSV can be re-imported cleanly without format conversion errors.

### Verification & Exit Criteria

- [x] **Executable accounting contract test suite**
  - _Details:_ Run automated Vitest test suite executing the base accounting table and payout-discrepancy examples defined in [transaction contracts](transaction-contracts.md).
  - _Verification:_ All scenarios pass with exact minor-unit precision, including erroneous payouts and recoveries.
- [x] **Cancellation and unavailable-purchase journeys (`C11`, `C12`)**
  - _Details:_ Execute the deferred customer journeys using owner cancellation and actual-funds reconciliation, including unpaid, partially paid and confirmed purchases.
  - _Verification:_ Support contact is visible, only eligible orders cancel, actual obligations remain actionable, and shipment/handoff races cannot both succeed with cancellation. These gates must pass before live merchant use.
- [x] **Fuzzing and race condition integration tests**
  - _Details:_ Concurrency test suite executing randomized simultaneous operations: racing payout claims, simultaneous receipt recording and order cancellation, and parallel duplicate receipt corrections.
  - _Verification:_ Zero data corruption, zero negative balances, and zero unhandled database deadlocks.

---

## M3 — Deploy, recover and pilot

### Container Packaging & Lean Production Runtime

- [x] **Multi-stage Dockerfile (measured image footprint)**
  - _Details:_ Create production Dockerfile utilizing Node 22 Alpine / distroless base, multi-stage dependency pruning, Next.js standalone build output, and non-root execution (`USER node`).
  - _Verification:_ Record compressed download and unpacked image sizes, platform and base image digest and compare changes against the measured current-setup baseline; the original 80 MB ceiling is relaxed, so optimize without changing the application stack solely to satisfy it.
- [x] **Memory consumption validation (measured steady and peak usage)**
  - _Details:_ Benchmark application container under load simulating 50 concurrent storefront visitors and 5 admin operations on a 1 vCPU, 1GB RAM virtual machine.
  - _Verification:_ Record steady and peak container memory, test duration and errors under the current setup; original memory ceilings are relaxed. Include worker load and document database/storage memory separately before selecting a production capacity budget.
- [x] **Graceful process termination (`SIGTERM`/`SIGINT`)**
  - _Details:_ Backend instrumentation installs a 35-second graceful shutdown drain for tracked in-flight work and provider calls before closing transports. Stop scheduling worker jobs during shutdown; database transaction locks end with their transactions.
  - _Verification:_ Compose allows a 45-second stop grace period, longer than the 35-second drain budget. Verify completed transactions remain committed, interrupted transactions roll back and unacknowledged deliveries recover after lease expiry.
- [x] **Platform deployment verification**
  - _Details:_ Test and verify deployment recipes for Docker Compose, Coolify, Railway, Fly.io, and managed cloud PostgreSQL (Supabase / Neon / AWS RDS).
  - _Verification:_ Successful deployment and health verification on each target platform using standard `.env` configuration.

### Worker Automation & Housekeeping

- [x] **In-process transactional outbox worker hardening**
  - _Details:_ Implement bounded retry policy with five retries after the initial attempt (1m, 5m, 15m, 1h, 6h), then terminal `exhausted` status. Later eligible messages remain deliverable.
  - _Verification:_ Failed SMTP delivery retries at expected timestamp intervals and moves to `exhausted` after six unsuccessful total attempts.
- [x] **Multi-replica worker lease coordination**
  - _Details:_ Use durable delivery leases and atomic claims shared by every replica, as defined in [events](api-events-spec.md#worker-lifecycle-and-retry). Transaction advisory locks may serialize short claim sections but release at commit and do not elect a persistent leader.
  - _Verification:_ With three replicas, verify exclusive current lease ownership and stream ordering, recovery after lease expiry when a replica stops, and rejection of stale acknowledgments. An uncertain external send follows the provider retry contract.
- [x] **Automated daily database and storage housekeeping jobs**
  - _Details:_ In-process cron runner executing daily maintenance:
    - Purge unconverted carts after 30 days and expire guest credentials. Retain inert guest ownership rows while referenced by converted carts or other history, following the data-model retention contract.
    - Prune eligible delivery payloads 30 days after delivery or explicit resolution, following the events retention contract. Retain actionable exhausted failures, exact retry material and identity tombstones.
    - Scan `payment_upload_intents` for expired pending uploads (>24h) and delete orphaned S3 object keys.
  - _Verification:_ Housekeeping deletes expired unreferenced records and revokes expired guest credentials while preserving converted carts, order references, independently scoped order sessions and financial/request history. Run with both abandoned and converted carts older than 30 days.

### Backup, Disaster Recovery & Upgrades

- [x] **Disaster recovery cold restore procedure (`O2`)**
  - _Details:_ Create and document script (`scripts/restore.sh`) that restores PostgreSQL database dump and object storage volume into an isolated instance with outbound email delivery strictly disabled (`DISABLE_OUTBOUND_DELIVERY=true`).
  - _Verification:_ Restoring backup into clean test environment allows inspection of all order and financial history without sending duplicate emails to customers.
- [x] **Outbox state reconciliation playbook**
  - _Details:_ Document operator checklist for reviewing pending outbox events after a disaster restore before re-enabling outbound deliveries.
  - _Verification:_ Operator can mark uncertain outbox events as suppressed or re-queue them safely.
- [x] **Database migration forward and rollback rehearsal**
  - _Details:_ Test automated Drizzle migration execution against a replica of production data, verifying zero-downtime forward schema evolution.
  - _Verification:_ Forward migrations execute cleanly on pre-populated databases without data truncation or locking table downtime.

### Observability, Diagnostics & Release Polish

- [x] **Health and diagnostic endpoints**
  - _Details:_ Implement `/api/health/live` (basic HTTP liveness), `/api/health/ready` (PostgreSQL connection check), and `/api/health/worker` (outbox queue lag, oldest pending event age, delivery error count).
  - _Verification:_ Querying `/api/health/ready` returns 200 OK when DB is healthy and 503 Service Unavailable when DB is disconnected.
- [x] **Three-tier Redis-free rate-limiting audit**
  - _Details:_ Verify Layer 1 (verified reverse proxy/edge rate limits and any required modules), Layer 2 (in-memory LRU token bucket on `/api/orders`, `/api/auth`), and Layer 3 (PostgreSQL attempt tracking for password and magic link tokens).
  - _Verification:_ Fuzzing checkout and recovery endpoints with 100 requests in 5 seconds triggers HTTP 429 Too Many Requests.
- [x] **Log sanitization and security audit**
  - _Details:_ Implement pino/winston logging serializer that automatically redacts passwords, session tokens, authorization headers, credit references, and customer PII from console output.
  - _Verification:_ Executing checkout and payment flows verifies zero secrets or plaintext tokens appear in Docker stdout logs.
- [x] **Documentation and quickstart release package**
  - _Details:_ Finalize comprehensive [README.md](../README.md), [merchant operations](merchant-operations.md), and [development and deployment](development-deployment.md). Include synthetic demo seed script (`pnpm db:seed`) creating demo store with sample products and orders.
  - _Verification:_ A new developer follows the documented install, service startup, migration, seed and application startup steps from a clean checkout. Record elapsed time and prerequisites; commands become supported only after this rehearsal passes.
- [ ] **Merchant pilot testing**
  - _Session kit:_ Use the [human pilot script and results sheet](merchant-pilot.md); record actual participant evidence before closing this item. The [production acceptance worksheet](launch-acceptance.md) owns real-host/provider and recovery results.
  - _Details:_ Supervise pilot deployment with a real test merchant executing the end-to-end flow: Store Onboarding $\to$ Product Listing $\to$ Customer Order $\to$ Payment Receipt Recording $\to$ Packing Slip Printing $\to$ Fulfillment Completion $\to$ Refund Resolution.
  - _Verification:_ Merchant completes all tasks without manual database intervention or unhandled application errors. Synthetic acceptance is supporting evidence; an observed human merchant pilot remains pending.

### Exit & Release Gates

- [x] **Automated 1-command quickstart demonstration (`O1`)**
  - _Details:_ Verify complete automated setup and synthetic order demonstration from clean checkout.
  - _Verification:_ `pnpm run test:e2e` executes all acceptance journeys successfully.
- [x] **Disaster recovery and schema upgrade certification (`O2`)**
  - _Details:_ Successful verified rehearsal of backup restore and schema migration.
  - _Verification:_ Zero data loss, zero duplicate payouts, and zero leaked emails.
- [x] **Cross-cutting accounting and concurrency invariants verified**
  - _Details:_ Verify every check in [user journeys](critical-user-journeys.md#accounting-and-concurrency-checks), including idempotency, money math, authorization isolation and outbox semantics.
  - _Verification:_ All release gates signed off with runnable test evidence. Milestone 3 ready for production release.
