# SupaStore generic online-store implementation plan

Status: core implementation completed locally; production acceptance and the deferred items below remain open.
Prepared: 2026-10-04, America/Los_Angeles.

## Implementation status — 2026-10-05

Customer authentication/profile/reset flows, configurable rewards with source accounting and refund reversal, variant inventory and scheduled slot limits, API-backed storefront/backend deployments, Stripe settlement/recovery, local delivery, and sales reports are implemented. Additive migrations 0022–0029 preserve existing orders and credit balances. See [validation and release limits](../docs/generic-store-validation.md) and [deployment instructions](../docs/two-service-deployment.md).

The follow-up implementation on 2026-10-06 adds category-wide reward rules and UTC activation dates, shared serializable contracts, staff slot rescheduling, partial shipments, signed carrier callbacks, and audited funding-review resolution. Reward review clears only after original frozen funding is repaired; uncertain sources remain suspended. Backend sources remain at the repository root behind the `apps/backend` launcher; storefront builds independently from `apps/storefront`.

The original performance ceiling is relaxed by user instruction. Continue optimizing within the existing two-service setup and record measured latency, memory, image and bundle changes. SMS sending remains hard-disabled pending explicit authorization of customer-data transfer to Twilio; no provider credentials are configured locally.

Live provider/email validation, a restored production upgrade rehearsal, sustained load testing, deployment and domain cutover remain release gates. Financial reward details are recorded internally; reward-detail notification emails are disabled.

## Objective

Deliver reusable online-store capabilities: customer authentication/profile management, configurable purchase rewards (including 5%), inventory per variant and optional fulfillment slot, shipping/pickup/local delivery, and two independently deployable services: backend and storefront. Extend SupaStore's existing financial and inventory mechanisms. Merchant use cases inform the plan without imposing platform-wide defaults or restrictions.

## Generic product boundary

- One configurable store and currency per deployment remains the initial boundary. Generic means reusable across merchants; multi-tenant hosting, simultaneous multi-currency, subscriptions, marketplace sellers and every product/service type require separate scope.
- Target physical-goods stores, including shipped retail, local pickup, scheduled delivery and made-to-order goods. Digital fulfillment, bookings and recurring billing are explicit future extensions, not implied implemented support.
- Configure branding, domain, locales, currency precision, timezone, account policy, payment methods, reward rules, stock tracking, fulfillment methods, tax rules and reporting thresholds through validated merchant settings.
- Ship neutral installation defaults: rewards off until configured, no statutory sales cap, no industry-specific shipping prohibition, no merchant branding or jurisdiction-specific rules in core logic. Existing stores retain compatible settings through migration.
- Use focused interfaces for payments, tax calculation and notifications. Stripe is the first online-payment adapter; manual payment remains supported. Avoid a general plugin framework.
- Merchant-specific restrictions belong in deployment configuration and operational runbooks. Domain transfer and external permit verification are merchant operations, not required product features.
- Acceptance must include at least a shipping-only retailer, pickup-only made-to-order store and mixed shipping/pickup store with rewards disabled/enabled and tracked/untracked products.

## Evidence and scope corrections

Inspected sources include `src/infrastructure/auth/index.ts`, `src/app/customer-actions.ts`, `src/app/interactive.tsx`, `src/application/use-cases/create-order.ts`, `src/application/use-cases/confirm-order.ts`, inventory and credit use cases/schemas, `src/domain/pickup-availability.ts`, sitemap/robots routes, `.github/workflows/ci.yml`, package/lock files, and `docs/commerce-release-evidence.md`.

- Accounts, verification, address books, order ownership, reset-password endpoints, variant reservations, credit funding, and original-source refunds already have implementations. Complete their missing flows and preserve their contracts.
- Sitemap/robots routes and PostgreSQL integration CI already exist. Verify their results and adapt them to the split rather than creating duplicate implementations.
- `package.json` declares `valibot: ^1.0.0-beta.9`, but the lockfile resolves stable 1.4.2. Correct the manifest and confirm reproducible installation.
- Release evidence records previous integration/browser passes; these were not rerun during planning. Production capacity, performance, recovery, and the new features still need acceptance evidence.
- Automatic payment rewards, Stripe settlement, slot limits, and separate deployments are new work.
- Existing conceptual docs contradict current accounts/inventory/credit implementation. Update them with the actual release boundary.
- GitHub CLI authentication currently fails. Local planning and implementation can proceed; remote PR creation and branch-protection configuration require restored authentication.

## Proposed decisions

These defaults make implementation concrete; validate them in step 1 before committing business-policy migrations.

1. Preserve guest checkout as the neutral default, with an optional merchant account-required policy. Verified accounts provide profiles, addresses, owned orders, and rewards. Never claim orders using matching email alone.
2. Implement an optional reward program with configurable rate in basis points (500 = 5%), eligible merchandise/categories, activation dates and earning/release policy. Initial supported policy earns on discounted merchandise allocated to settled external payments, excluding tax, shipping, tips, overpayments, and store-credit-funded value. Release on completed fulfillment and redeem on future orders. Manual receipts qualify after verification. No historical backfill by default. Validate supported settings rather than imply arbitrary policies are implemented.
3. Snapshot reward rate, eligibility, customer identity and policy at accepted order creation. Allocate the accepted external funding proportionally across net merchandise lines, tax and shipping using the exact largest-remainder rule below. Calculate rewards once on the sum of externally funded eligible net merchandise, rounding down to integer currency minor units. Compute partial-refund reversals cumulatively against original allocations. Later category/rate changes never change accepted orders.
4. Track credit issuance lots and source allocations for holds, capture and refunds. Consume reward credit first, then other credit, FIFO within each group by creation timestamp/ID. Keep promotional rewards distinguishable from merchant-issued and refund-restored credit; purchased credit is supported only if separately implemented. Revoke unreserved remaining value from the affected reward lot first; record unrecovered value as reward debt offsetting future earnings. Never consume unrelated credit or break existing checkout holds. See the debt/hold contract below.
5. Start with no reward expiry or transferability. Version policy changes; never retroactively rewrite earned history. Rewards eligibility requires a verified account linked at accepted order creation; later guest claims do not generate past rewards.
6. A fulfillment slot means a location/service area + fulfillment method + local calendar date + time window, with stable identity and timezone snapshot. Scheduling is optional for pickup/local delivery; ordinary shipped orders require no slot. Variant stock, per-slot variant quotas, and total slot order capacity are separate constraints. Null limit means unlimited; zero means unavailable. Initially retain one physical stock pool per variant; multiple warehouses require separate design.
7. Reserve tracked stock and any applicable slot capacity when creating an unpaid order. Manual-payment deadlines create a review queue and never automatically release reservations, since money may have arrived without a recorded receipt. Provider checkout holds may expire only through a provider-specific terminal/reconciliation procedure. Once paid/confirmed, preserve the reservation through fulfillment. No merchant-specific preparation deadline applies to every store.
8. Two services in one pnpm workspace: `apps/backend` (API, admin, auth, worker) and `apps/storefront` (customer Next.js UI). Backend alone accesses PostgreSQL. Shared contracts contain serializable types/validation; backend business code never enters the storefront bundle.
9. Keep the backend worker within the backend deployment for the initial two-service release. Use durable leases and test coordination with overlapping instances during deployment.
10. Route public `/api/*` through an explicit reverse proxy to backend for same-origin browser credentials. Backend auth owns sessions; storefront SSR forwards only approved cookies/request context. Use separate customer and staff credential scopes where feasible. Do not introduce broad parent-domain cookies as a shortcut.
11. Merchants configure shipping, pickup and local delivery independently, including destinations/service areas, rates, free-shipping thresholds, locations, optional schedules and product restrictions. Backend validates eligibility. Industry/license restrictions are optional merchant policies, with jurisdiction-specific validation in deployment runbooks.

## Architecture and invariants

Browser -> storefront UI -> backend API -> application transaction -> PostgreSQL.
Backend admin -> same application use cases.
Payment provider (initially Stripe) -> authenticated webhook -> durable inbox -> backend settlement use case.
Backend outbox worker -> email/SMS/payment reconciliation adapters.

- Prices, payment totals, credit, ownership, inventory, and permissions are calculated/enforced on backend.
- One authoritative use case per command, shared by admin/API/webhook entry points.
- Order creation atomically reserves applicable tracked variant stock, optional slot quotas/capacity, and any applied credit. Untracked stock, unscheduled fulfillment and disabled rewards require no corresponding configuration. Define lock ordering against existing financial locks; sort multiple slot/variant keys deterministically.
- No provider network calls while holding financial locks. Persist intent first, call provider with stable idempotency keys, reconcile durable results.
- Receipts, rewards, corrections, inventory movements, and refund history remain auditable and append-only.
- A redirect or payment screenshot never establishes payment success.
- A paid order cannot lose reserved inventory through an unrelated timeout. Late successful payments after reservation release enter an explicit refund/review path; never silently oversell.
- Preserve internal IDs, historical financial snapshots, private order links, original-source refunds, and staff authorization.

## Delivery steps

Each numbered step is a focused delivery milestone, split into smaller PRs if review size grows. Use `codex/` branches; preserve the current checkout's work. Run meaningful targeted tests with each change and the complete suites at milestone boundaries. Every step updates its owning docs and records evidence against the actual revision.

### 1. Establish baseline and business contracts

Dependencies: none. Complexity: medium.
Context: several checklist claims predate existing commerce work; new policy must not contradict current ledgers.

- Run current typecheck, unit, PostgreSQL integration, production build and production browser suites against disposable fixtures.
- Record revision, test counts, failures/skips, and migration history. Verify CI has no silently skipped integration suite and identify required check names.
- Correct scope/architecture/schema docs to reflect accounts, stock, credit, SEO, and actual deployment.
- Finalize supported configurable reward eligibility/debt/rounding, reservation deadlines, optional slot semantics, fulfillment/tax policies, and service routing. Define neutral defaults and migration behavior for existing stores.
- Correct Valibot manifest to the already resolved stable version and verify frozen-lockfile install.

Exit: written contracts, reproducible baseline, each failure tracked; existing financial invariants retained.
Rollback: documentation/dependency-manifest revert; no live schema changes.

### 2. Introduce backend API contracts

Dependencies: 1. Complexity: high.
Context: storefront currently imports server-side use cases/database reads and uses Next server actions.

- Inventory every storefront dependency: catalog/search/translations/content, cart, quote, checkout, account, owned/guest orders, recovery, evidence upload, public assets, sitemap data, credit and slot availability.
- Add explicit versioned API routes around existing use cases; define validation, auth scopes, error codes, pagination, locale, idempotency keys and request IDs.
- Extract safe contracts and an API client; translate server-action redirects/revalidation into client behavior without duplicating domain logic.
- Add API ownership/authorization and stale-quote tests. Ensure account/session/order proofs cannot be supplied as trusted user IDs.
- Make catalog caching/invalidation across services explicit: bounded TTL first, with a documented maximum stale period and server revalidation at checkout.

Exit: storefront-relevant capabilities have tested API contracts and retain existing ownership/financial behavior.
Rollback: original in-process adapters remain available until split acceptance; only one implementation per command.

### 3. Create and verify two independently deployable services

Dependencies: 2. Complexity: high.
Context: keep backend Next.js/admin/use cases initially; extracting services does not require replacing frameworks.

- Establish workspace apps and backend-only/shared packages; move routes, code, assets, config, build scripts and test fixtures deliberately.
- Convert storefront catalog/RSC reads, actions, assets and sitemap to API access. Enforce that storefront has no DB/storage/SMTP/Stripe secrets or backend imports.
- Build separate Docker images with health/readiness checks, migration job and environment samples. Run worker only with backend lifecycle.
- Configure reverse proxy, host/origin validation, cookie forwarding, CSRF checks, reset/verification callback URLs, upload URLs and public image caching.
- Use shared database-backed sensitive rate limits or ingress enforcement where appropriate; do not depend on independent process counters across replicas.
- Rework CI and disposable browser fixtures to start both services, test backend unavailability, and test compatible rolling deployment.

Exit: two images boot independently; all existing customer/admin journeys pass through the service boundary. Storefront cannot connect to DB.
Rollback: retain compatible APIs/schema and deploy prior app artifacts; never run incompatible migration/code combinations.

### 4. Complete customer auth and profiles

Dependencies: 3. Complexity: medium.
Context: Better Auth already supports registration/login/verification/reset; address/order ownership use cases exist.

- Add usable forgot/reset-password screens, verification resend, profile name/phone editing, password change and logout/session handling.
- Support email changes only through a separately verified flow; never alter purchase snapshots or automatically transfer order ownership.
- Support merchant-configured guest checkout or account-required checkout; enforce the setting on backend. Preserve verified account credit access, explicit guest-order claims and staff membership checks.
- Audit reset-email error propagation/delivery observability; generic public responses must still expose provider failure to operations.
- Cover unknown-email responses, expired/reused reset tokens, session revocation, profile ownership, failed verification delivery and both supported locales.

Exit: register -> verify -> login -> edit profile -> reset password -> login with new password passes against SMTP fixtures; other customers/staff data remain inaccessible.
Rollback: feature flags for new profile flows; preserve existing account identities and claim proofs.

### 5. Add slot capacity and variant-per-slot inventory

Dependencies: 6 (fulfillment model and configuration), plus finalized reservation contract in 1. Complexity: high. Execute step 6 before this step; milestone numbering is retained for existing references.
Context: global variant stock/reservations and canonical `pickup_time_slots` already exist. Extend the unique location/date/start/end snapshots in `src/infrastructure/db/schema/shipping.ts`; generated pickup eligibility is not a capacity ledger. Coordinate `src/domain/locking/lock-order.ts`, order creation, fulfillment and `src/infrastructure/worker/housekeeping.ts`.

- Extend existing pickup slots into optional fulfillment-slot capacity for scheduled pickup/local delivery, using backward-compatible method/location/service-area identity. Add variant quotas, reservation states and audited adjustments. Preserve historical snapshots. Reject capacity reductions below committed bookings unless an explicit audited resolution handles affected orders.
- For tracked products, constrain quantity by both global available stock and slot quota; for made-to-order products, allow slot quota without global tracking. Do not count the same physical units twice.
- Reserve all relevant resources within order creation using explicit lock order; capacity counts each order once, variant quotas count units.
- Admin sees remaining/booked capacity and can configure recurring defaults/date overrides. Storefront disables full options but backend remains authoritative. Shipping-only stores can check out without slot configuration or selection.
- Implement provider-safe unpaid expiration, owner-reviewed manual cancellation, fulfillment, rescheduling, schedule edits and closed-slot archival. Persist deadlines and method-specific expiry eligibility; do not automatically cancel manual orders. Rescheduling locks source and destination in deterministic order and acquires destination capacity before releasing source in one transaction.
- This milestone adds reservation release primitives and review metadata only; automatic provider expiration remains disabled until step 7 supplies payment-intent reconciliation and its race tests.
- Preserve capacity booking after completed pickup until slot closes; completed orders still consumed production capacity. Restocking physical returns does not reopen a past slot.

Exit: concurrent final-unit/final-slot attempts cannot oversell; failed transactions leak no reservations; DST boundaries and paid/unpaid timeout races pass PostgreSQL tests.
Rollback: disable new reservations and reconcile existing holds; do not drop active reservation tables or overwrite global inventory history.

### 6. Add configurable tax and fulfillment policies

Dependencies: 3; supported tax/fulfillment contracts from 1. Complexity: medium/high.
Context: current store/get-quote tax uses global rate/inclusive settings. Mixed-cart line allocation and order snapshots must precede Stripe/refund integration; a product taxable flag alone cannot capture every utensil/bundle/fulfillment condition.

- Introduce product tax classifications, destination-based supported rate rules, inclusive/exclusive pricing, applicable order context, explicit tax lines and immutable calculation-policy snapshots. Represent tax exemptions as configuration rather than industry-specific conditionals.
- Define a narrow tax-calculation interface and implement a documented manual-rule adapter first. Reject or flag unsupported jurisdictions rather than imply universal legal tax coverage; additional providers can implement the same interface.
- Preserve deterministic quotes, merchandise discounts and credit allocation; test mixed taxable/exempt baskets and tax refunds.
- Complete shipping zones/flat rates/free thresholds, local-delivery service areas/rates, pickup locations and per-product fulfillment eligibility; validate addresses and supported destinations on backend. Preserve fulfillment quotes in order snapshots and test mixed-cart incompatibilities.
- Establish the local-delivery order/quote method, service-area identity and backward-compatible fulfillment references before slot migration. Keep one fulfillment per order and require one compatible method for the whole cart; quantity-based partial shipments are supported within that method, with completion only after all units are delivered.
- Define shipment dispatch separately from delivery completion: dispatch consumes stock once and marks fulfillment shipped while lifecycle remains confirmed; manual delivery confirmation marks fulfilled/completed. Pickup completes on verified handoff, local delivery on recorded delivery. Rewards release only at fulfilled/completed, never at dispatch. An optional signed carrier gateway can record verified delivery; native carrier-specific adapters remain future work.
- Make schedules/capacity optional and independent of stock tracking. Shipping does not require pickup settings. Introduce a shipping-rate adapter boundary for future carrier rates without requiring live carrier integration in this release.
- Document merchant responsibility for configuring tax/license requirements. Validate specific jurisdictions only in optional store examples/runbooks, where applicable.
- Deliver merchant settings/onboarding for fulfillment methods, addresses, schedules and tax in this milestone, with backend validation and UI round-trip tests. Do not defer these screens to launch.

Exit: approved product/order examples produce itemized, reproducible totals; prohibited fulfillment cannot bypass backend checks.
Rollback: pause affected sales until a compatible tax-policy fix; retain historical snapshots.

### 7. Add online-payment adapter with Stripe and original-method refunds

Dependencies: 5, 6. Complexity: high.
Context: preserve unpaid order -> receipt -> confirmation and existing mixed-source refund contracts.

- Define narrow payment capabilities for session creation, settlement verification, expiration, refunds and reconciliation. Implement Stripe as the first adapter alongside existing manual methods. Keep Stripe event fields/signature logic in the adapter and use provider-neutral application contracts.
- Add provider payment attempts/session linkage, durable webhook inbox, provider-event uniqueness, settlement/refund identities and reconciliation jobs.
- Create Checkout sessions for the backend-calculated outstanding external balance using stable keys and persisted intents; align session expiration with stock holds.
- Validate webhook signatures against raw bodies and verify order, currency, amount and final paid status. Process duplicate/out-of-order/replayed events safely.
- Apply settlement using a provider-authorized use case; do not impersonate owner/staff or bypass financial invariants. Auto-confirm eligible fully funded orders.
- Handle async success/failure, abandoned checkout, session creation timeouts, existing manual receipts, credit-only orders, under/overpayments, corrections and late payments after holds expire.
- For provider expiry, persist an expiration intent, reconcile/expire checkout outside DB locks, then re-lock the order and verify eligible terminal unpaid state before atomically releasing stock/slot/credit. An uncertain or processing payment retains holds and enters review. Delayed success after release uses the explicit original-source refund/review path.
- Refund through persisted original-source allocations: restore credit portions internally and external portions via Stripe. Settle payouts only from confirmed provider outcomes; reconcile uncertain requests without double refunds.
- Add dispute/chargeback review holds and an operations queue. Show pending/paid/failed states without relying on the success redirect.

Exit: sandbox lifecycle plus duplicate webhook/refund tests pass; bounded real charge/refund smoke test is scheduled as an explicit launch operation.
Rollback: disable new Stripe checkout; keep webhooks, reconciliation, refunds and existing orders operational.

### 8. Implement configurable automatic reward credit

Dependencies: 4, 7. Complexity: high.
Context: reuse store-credit redemption but distinguish promotional earnings, reversals and debt from other credit sources. Complete the step 6 dispatch/delivery distinction in both `fulfill-order.ts` and pickup/local-delivery operations before adding reward release. Existing credit constraints prohibit negative spendable balances.

- Add validated merchant settings for enabling rewards, basis-point rate, supported eligibility rules and release policy; expose admin preview/examples. Add versioned reward policies, immutable earning basis, per-order earning identity, cumulative reversal records and promotional-credit provenance/debt support.
- Implement one deterministic eligibility/allocation calculator used by display and issuance. Include externally paid/manual verified portions only; exclude credit recycling and excess/late payments.
- Add source lots and reservation/debit/refund allocations, using the detailed contract below. Backfill existing balances/history without inventing purchased credit or rewriting applied entries.
- On completed delivery/handoff with verified funding, issue rewards atomically and idempotently in every completion use case. Repeated events cannot earn twice. Partial fulfillment is deferred; shipping dispatch issues no redeemable reward.
- Recalculate earned entitlement on partial/full refund, receipt correction and chargeback resolution. Reverse differences with auditable compensating entries, including already-spent rewards under the selected policy.
- Customer sees eligible/pending/earned/reversed credit and admin sees policy, debt and adjustment reasons. Keep promotional rewards separate from original-source refund restoration.
- Deliver reward policy configuration, profile/account settings and reporting settings with their feature milestones. Validate create/edit/save/read round trips and configuration changes with open orders.

Exit: rewards disabled issues no promotional credit. At 5%, $40 eligible external merchandise earns $2 and $10 credit + $30 external merchandise earns $1.50; alternate supported rates and currency precisions calculate correctly. Rounding, repeated partial refunds, full refunds after spending, corrections, policy changes and webhook retries preserve exact balances.
Rollback: disable new earning; retain redemption, reversals, debt and previously issued obligations.

### 9. Add annual sales tracking and operating reports

Dependencies: 6, 7; reward display integration after 8. Complexity: medium.
Context: reports aggregate store activity across methods; statutory thresholds are optional merchant configuration.

- Define gross sales, net sales, collections, taxes, refunds and credit liabilities separately, with configurable reporting period/fiscal-year start, timezone, documented calculation basis and outside-system sales adjustments.
- Aggregate all relevant payment/order channels without double counting retries, reward issuance or refund-credit issuance. Report sales separately from collections, processor fees and credit liabilities.
- Add auditable imports/adjustments for other sales, optional configurable cap/thresholds, YTD/period dashboards and CSV export. No cap is enabled by default; permit thresholds are examples rather than platform constants.
- Emit deduplicated threshold alerts; show reporting basis and reconciliation exceptions.

Exit: fixture covering cash, bank, Stripe, mixed credit, refunds, corrected receipts and year boundary matches approved expected totals; repeated alerts deduplicate.
Rollback: disable reports/alerts pending formula fix; preserve accounting and adjustment history.

### 10. Complete SEO, analytics and optional SMS

Dependencies: 3; notifications depend on 7/8 where applicable. Complexity: medium.
Context: sitemap/robots already exist but currently query DB directly; email outbox is reusable.

- Verify published-only sitemap data via API, canonical URLs, locales, product Open Graph metadata, structured data and exclusion of private pages from indexing; robots is not authorization.
- Select/configure analytics with explicit privacy settings; deduplicate completed-purchase events and exclude customer tokens/payment evidence/PII.
- Add optional consent-based SMS order/payment/shipping/pickup/local-delivery notifications through the outbox adapter with merchant templates, locale, opt-out handling, delivery state, retry/deduplication and quiet-hour rules.
- Verify current SMS/provider pricing and registration requirements before enabling a provider. Measure actual reach instead of assuming SMS superiority.

Exit: SEO checks and publication/privacy tests pass; analytics records a purchase once; opted-out customers receive no SMS.
Rollback: disable analytics/SMS adapters; email and order operations continue.

### 11. Production measurements, security and recovery acceptance

Dependencies: 4-10 (SMS may remain disabled). Complexity: high.
Context: earlier runtime targets are unverified; service extraction creates new security and performance boundaries.

- Run complete typecheck/unit/integration/production browser/build suites for both apps with no unexpected skips. Require CI checks on release branch using authenticated repository administration.
- Measure each image, each service RSS, combined host RAM, storefront transferred JS, cached/uncached latency, database connections and worker throughput under representative concurrent checkout load for at least 30 minutes.
- Record dataset, hardware, methodology, revision and results. Set budgets from measured constraints; a synthetic benchmark alone is insufficient production evidence.
- Review secrets, API/cookie/CSRF/SSRF boundaries, staff revocation, webhook replay, evidence access and multi-instance rate/worker coordination.
- Perform keyboard/screen-reader acceptance for auth, optional slot selection, checkout and admin-critical operations. Run the generic acceptance matrix below to verify neutral installation defaults.
- Restore DB/assets into isolated infrastructure with outbound delivery suppressed. Verify restoration of payment/reward/inventory obligations and provider reconciliation before resuming side effects.

Exit: critical journeys pass, restore succeeds, measurements meet agreed budgets and no unresolved launch-critical issue remains.
Rollback: compatible artifacts and restore playbook available; preserve all ledger/reservation obligations.

### 12. Generic deployment and staged launch

Dependencies: 11; optional domain preparation can begin after 1. Complexity: medium plus external operations.
Context: deploy a neutral store configuration first; domain transfer is an optional merchant operation, not a platform prerequisite.

- Inventory registrar expiry/locks, transfer eligibility, exact renewal/transfer quotes, DNS records, DNSSEC, TLS and SMTP SPF/DKIM/DMARC. Verify transfer-year/renewal behavior rather than assuming every year stacks.
- Prepare and review DNS/transfer changes and rollback records. Coordinate final domain/registrar writes and real payment/refund operations with the owner; planning does not authorize account spending or external changes.
- Back up and apply additive migrations to a restored copy, then the intended environment with monitored deployment. Avoid destructive schema cleanup until compatibility window closes.
- Run the neutral onboarding already delivered and tested with feature milestones: store identity, currency/precision/timezone, payment accounts, tax, fulfillment, stock, rewards and notifications. Reject incomplete configurations only when their related feature is enabled; launch adds no untested configuration screens.
- Verify real SMTP delivery, both services, private order recovery, enabled fulfillment limits, manual receipts and a small Stripe charge/refund with authorized operator execution.
- Enable ordering/rewards gradually; monitor failed payments, reservation drift, reward balances, refunds, worker backlog and cap alerts.
- Switching a merchant to another commerce platform requires explicit data/liability migration; it is not a platform rollback mechanism.

Exit: production acceptance evidence, operational owner and documented rollback/reconciliation path; every checklist item implemented, verified, or explicitly deferred with reason and owner.

## Dependency order and optional parallel work

Critical order: 1 -> 2 -> 3 -> 6 -> 5 -> 7 -> 8 -> 11 -> 12; step 4 runs after 3 and must finish before 8. Step 9 completes after 7/8 and before 11.
Step 9 can start after 7; integrate rewards before final acceptance.
Step 10 can start after 3; finish required SEO/analytics before 11, and explicitly decide whether SMS is enabled at launch or delivered afterward.
Step 4 may proceed alongside step 6 with coordinated settings/API ownership. Step 5 consumes step 6's fulfillment identities and is not independent. Complete merchant configuration screens and their browser acceptance before step 11.
Domain research/preparation can run early without changing live DNS.

## Validation commands and migration discipline

Before workspace changes: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:coverage`, `pnpm build`, `node scripts/test-browser.mjs --production`.
After extraction: preserve root commands as workspace aggregators and add filtered build/typecheck commands for backend/storefront. Production browser fixtures start both images. Add targeted real-PostgreSQL concurrency tests and Stripe/email/SMS provider fixtures; avoid production credentials in tests.

Every migration must pass clean-install and forward-upgrade tests against a restored fixture. Ledger-changing releases use compatible forward fixes; rollback may pause new operations but must not erase or ignore earned credit, paid orders, pending refunds, or reservations.

## Scope completion checklist

| Request/checklist item                           | Delivery step                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Customer login/register/profile/reset            | 4                                                                   |
| Configurable rewards, including 5%               | 8                                                                   |
| Variant stock and slot inventory/capacity        | 5                                                                   |
| Backend/storefront split                         | 2-3                                                                 |
| Stripe/payment/refund integration                | 7                                                                   |
| Configurable tax and fulfillment policies        | 6                                                                   |
| Integration test/CI evidence                     | 1, 11                                                               |
| Performance budgets                              | 11                                                                  |
| SEO/analytics                                    | 10                                                                  |
| Stable validation dependency                     | 1                                                                   |
| SMS                                              | 10, enabled according to launch decision                            |
| Shipping zones/rates, pickup and local delivery  | 6; live carrier rates and specialized cold-chain logistics deferred |
| Sales reporting and optional merchant thresholds | 9                                                                   |
| Optional merchant domain transfer                | 12 operational runbook                                              |
| Stale docs and deployment limits                 | 1-3, 11                                                             |

## Generic acceptance matrix

| Store configuration                | Required acceptance                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shipping-only physical retailer    | Tracked variant stock, destination rates/tax, card/manual payment, no pickup location or slot required, rewards off                                  |
| Pickup-only made-to-order merchant | Untracked global stock, optional variant slot quotas, preparation cutoff configured by merchant, 5% rewards enabled                                  |
| Mixed shipping/pickup merchant     | Supported method/address/slot rules, variant eligibility and conflicting cart restrictions enforced on backend                                       |
| Scheduled local-delivery merchant  | Service-area eligibility, delivery rate and timezone-aware capacity; ordinary shipping/pickup settings not required                                  |
| Configurable accounts and rewards  | Guest allowed/account required, rewards disabled/alternate rate, verified ownership and currency-precision correctness                               |
| Existing installation upgrade      | Original IDs, balances, reservations and snapshots retained; existing fulfillment behavior remains compatible                                        |
| Neutral fresh installation         | No merchant branding, jurisdiction-specific tax rate, permit cap, fixed reward percentage or industry shipping restriction appears unless configured |

These fixtures verify the documented supported store types. They do not certify universal tax compliance, digital goods, subscriptions, multi-warehouse inventory or multi-tenant operation.

## Inspection results and concrete change map

This section resolves the review findings against current source/specs. It is a design proposal, not implemented behavior. Inspection performed 2026-10-04; test suites were not run for this plan revision.

| Current setup/spec                                                                                                                                          | Consequence and implementation location                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `package.json` owns one Next app; `pnpm-workspace.yaml` contains only build permissions, not package globs                                             | Add `apps/*` and `packages/*` workspace globs, per-app manifests/tsconfig/Next/i18n configuration, shared contract package and root aggregate scripts. Keep backend domain/application/persistence together rather than expose them as storefront dependencies.                                                                              |
| `next.config.ts` uses a root i18n path and optional standalone output; Dockerfile copies root standalone artifacts                                          | Give each app its own i18n/config/output; test monorepo standalone tracing and actual server/static paths. Split Docker targets/images and migration packaging.                                                                                                                                                                              |
| Compose has one `app` containing secrets and worker, plus PostgreSQL/storage; Adminer and RustFS both bind host port 9001                                   | Replace `app` with backend/storefront and explicit proxy routing. Resolve port conflict; make development inspection services optional. Storefront receives only its backend origin/public configuration. Backend receives DB/payment/storage/SMTP secrets.                                                                                  |
| `docs/product-scope.md` excludes accounts/inventory/credit despite current implementations; `docs/transaction-contracts.md` extension section includes them | Update authoritative scope and remove contradictory workflow paragraphs. Plan is proposed direction; owner specs must be changed in step 1 before feature implementation. Do not add competing contracts only in the plan.                                                                                                                   |
| `orders.ts` and `get-quote.ts` constrain fulfillment to shipping/pickup; fulfillment has a unique order ID                                                  | Add local_delivery consistently across schema, request validation, quote snapshots, admin, APIs and UI. Retain one method/fulfillment per order and explicitly retain one fulfillment method while supporting quantity shipments.                                                                                                            |
| `shipping.ts` canonical pickup slots require a pickup-location FK                                                                                           | Preserve old snapshots/FKs. Add additive generic fulfillment-slot/service-area storage or a reviewed compatible migration; a delivery area cannot be inserted into the old pickup-location FK. Prefer a separate generic capacity slot referencing legacy pickup slots uniquely where applicable, so existing order references remain valid. |
| `fulfill-order.ts` currently consumes stock and immediately completes the order; pickup has separate ready/handoff operations                               | Split dispatch and completion contracts. Reuse terminal reservation states to prevent double consumption; pickup and local-delivery completion must call the same reward release helper. Update cancellation/refund eligibility for shipped-but-not-completed orders.                                                                        |
| `store-credit.ts` has aggregate balance/reservation counters and a single reversal link; `credit-operations.ts` holds/captures aggregate amounts            | Add source lot/provenance and allocation tables with scoped FKs, uniqueness, nonnegative component checks and request identities. Keep append-only existing entries; do not attempt cumulative partial reward reversals through the existing one-reversal-per-entry mechanism.                                                               |
| `purchase-refund.ts` restores original funding but has no issuance-lot restoration                                                                          | Extend its original-source calculation to restore each consumed lot's provenance and capped amount; reward revocation/debt determines whether restored promotional value is spendable. Preserve total customer refund entitlement.                                                                                                           |
| `docs/transaction-contracts.md` says manual deadlines only prompt review; housekeeping has no unpaid-order expiry                                           | Preserve manual behavior. Add a dedicated expiration use case and worker scheduling only for explicitly supported provider workflows; housekeeping must not release arbitrary unpaid orders.                                                                                                                                                 |
| Lock helper includes sorted stock locks but no credit/slot targets, while transaction spec defines additional ranks                                         | Audit all direct `FOR UPDATE` calls. Define one total order including slot, credit-lot/debt and provider-intent locks before implementation; update helper and callers together. Reward issuance/refunds must acquire credit locks before receipt locks, not call a lower-rank helper afterward.                                             |

### Exact reward basis and policy snapshot

1. At accepted order creation, persist reward policy version/rate and line eligibility with immutable net merchandise, discount, tax and fulfillment components. Quote revalidation detects relevant policy changes; retry returns the original accepted snapshot. Reward customer must already be linked at acceptance (a stronger, unambiguous rule than account linkage sometime before payment).
2. Let P be total payable and E the accepted external-funded amount (P minus captured store credit, excluding overpayments). Components c_i sum to P: each discounted merchandise line excluding tax, each tax component, and shipping/delivery fees. If P = 0, the basis and reward are zero. Use integer minor units and overflow-safe intermediate arithmetic.
3. Allocate E proportionally: initial external allocation a_i = floor(E*c_i/P). Distribute E - sum(a_i) remaining units by descending remainder (E*c_i mod P), ties by component type and immutable order-line/component ID. Derive credit funding as c_i - a_i. Persist these allocations; total external and credit allocations exactly match their funding sources. Inclusive tax is extracted before merchandise eligibility is applied.
4. Reward basis B is the sum of a_i for eligible merchandise only. Reward R = floor(B*rateBasisPoints/10000), once per order rather than separately rounded per item/payment. Freeze finalized external funding at confirmation; additional receipts never earn rewards. Do not recompute accepted eligibility at fulfillment.
5. Use original per-component/per-source refund allocations to determine remaining eligible external merchandise. Cumulative target reward is floor(remainingBasis*originalRate/10000); reverse prior earned entitlement minus that target. Tax/shipping refunds alone do not reduce merchandise rewards. Corrections cap supported external funding under the existing correction contract and require review when source allocation becomes uncertain; never redistribute lost funding to another source just to preserve rewards.
6. Policy disabled after acceptance prevents earning for new orders only; accepted eligible orders keep their original entitlement. Before release, refunds/corrections reduce pending entitlement without issuing then reversing unnecessary spendable entries.

Acceptance examples (two-decimal currency):

| Accepted basket/funding                                                         | Expected reward at 5%                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Eligible merchandise 40, no tax/fees, external 40                               | 2.00                                                          |
| Eligible merchandise 40, credit 10, external 30                                 | 1.50                                                          |
| Eligible merchandise 40 + tax/fees 10, credit 10, external 40                   | External merchandise basis 32; reward 1.60                    |
| Eligible merchandise 20 + ineligible merchandise 20, credit 20, external 20     | Eligible external basis 10; reward 0.50                       |
| All external merchandise 40; cumulative eligible merchandise refunds 10 then 10 | Target reward 1.50 then 1.00; incremental reversals 0.50 each |
| Accepted at 5%, then settings change to 10% before completion                   | Original 5% rate applies                                      |

Add cent-level largest-remainder fixtures, inclusive/exclusive mixed tax, multiple payment receipts, zero-total orders and supported currency precisions.

### Credit provenance, holds and reward-debt contract

- Represent every positive issuance as a source lot tied to its immutable entry, source kind and optional reward/order identity. Legacy credit is classified from evidenced origin; unresolved origin remains `legacy`/merchant credit, never invented promotional credit. Backfill only after replay/reconciliation of existing issue/debit/refund/reversal history; quarantine unresolvable cases for reviewed repair.
- Reserve specific spendable lot amounts at checkout: reward lots first, then other lots, FIFO by created_at/ID. Capture consumes those same allocations; release returns the same provenance. The sum of source holdings/captures must match existing aggregate reservation/debit amounts and funding snapshots.
- Refunds restore consumed sources proportionally to their original allocations using capped cumulative arithmetic and deterministic remainder order. Restore source lineage instead of labeling all restored amounts as newly issued generic refund credit. A refund never earns another reward.
- Revoking reward entitlement removes unreserved remaining value from its source lot first. Reserved value cannot disappear from another accepted order's hold: retain the hold, mark that lot's revoked entitlement and create debt for unrecovered entitlement. Already consumed portions create the same debt, without decrementing unrelated spendable credit.
- If a held revoked portion is later released, its value becomes nonredeemable and offsets associated outstanding debt. A refund restoring a consumed revoked reward portion follows the same rule. When associated debt was already offset by later earnings, preserve the restored customer entitlement without recovering it again. Every recovery records identity/source, is bounded by remaining debt and reconciles atomically; double recovery is forbidden.
- Future rewards offset outstanding debt before any spendable reward issuance. Record gross earning, debt recovery and net credit separately so reward reports still reconcile. Debt is not a customer charge and does not reduce original-source cash refund entitlement.
- Serialise issuance, redemption, refund, reversal and debt recovery under customer credit account/lot locks in the documented global lock order. Cases: reversal versus active hold, hold capture/release, refund after debt repayment, simultaneous refunds, zero available promotional balance and repeated events.

### Fulfillment and onboarding contracts

- Shipping: confirmed/unfulfilled -> preparing -> shipped (stock consumed once) -> fulfilled/completed on staff-recorded delivery. Initial reward release occurs at that delivery record. Quantity shipments and signed gateway delivery callbacks are supported; rewards wait for every ordered unit to be delivered. Historical completed orders retain their existing meaning; do not downgrade them or backfill rewards.
- Pickup: confirmed -> ready_for_pickup -> verified handoff -> fulfilled/completed, consuming stock and releasing rewards once.
- Local delivery: confirmed -> preparing -> out_for_delivery (stock consumed once) -> recorded delivery -> fulfilled/completed. Final status vocabulary and failed-delivery/return handling belong in business workflows; unsuccessful delivery does not automatically restock physical goods or release rewards.
- Terminal fulfilment completion is separate from future payment/refund reconciliation. Dispatch blocks ordinary cancellation; use returns/refunds for dispatched items. Readiness/dispatch never releases unused scheduled capacity as if the order had not consumed that production/delivery window.
- Step 1 defines settings schemas/defaults. Steps 4, 6, 7, 8, 9 and 10 deliver their settings screens/API validation and round-trip browser tests. Step 11 runs neutral onboarding from an empty fixture; step 12 repeats the accepted workflow in production.
- For the service split, establish browser/proxy/SSR cookie and URL contracts before moving files. Test cart and private-order proof continuity, response Set-Cookie forwarding, trusted origins, asset URLs and anonymous/authenticated catalog access with backend unavailable. The existing worker bootstrap moves only to backend; migration execution remains a separate deployment action.

### Required specification updates before implementation

| Owner document                           | Rule to change                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/product-scope.md`                  | Actual implemented commerce baseline; generic physical-store scope and deferred capabilities; two-service release boundary                                         |
| `docs/business-workflows.md`             | Guest/account policy, delivery methods, dispatch/completion, manual review versus provider expiry, pending/released/reversed rewards and settings changes          |
| `docs/transaction-contracts.md`          | Exact allocation/rounding, provenance/debt/refund recovery, total lock order, provider settlement/expiry and retry identities                                      |
| `docs/database-schema.md`                | Additive fulfillment/service-area/slot capacity, reward policy snapshots, source lots/allocations/debt, provider inbox/intent storage and migration reconciliation |
| `docs/api-events-spec.md`                | Dispatch/delivery versus completion, payment inbox events and reward issuance/reversal events; preserve existing order sequence/deduplication                      |
| `docs/architecture-overview.md`          | API ownership, shared package limits, auth/proxy/SSR boundary, backend worker and migration execution                                                              |
| `docs/critical-user-journeys.md`         | Generic store matrix and financial/concurrency examples above                                                                                                      |
| Deployment guides, Compose/Docker and CI | Two images, neutral fixture onboarding, secret separation, restore/upgrade and measurable acceptance                                                               |

Resolve source/spec disagreements explicitly; neither stale docs nor current shortcuts automatically define the new contract. Implementation begins with owner-spec updates and targeted regression cases, followed by compatible migrations/use cases, then API/admin/storefront flows.

## Plan maintenance and review

Track implementation status, revision and evidence per step. Split oversized milestones, document new dependency edges, and revise the affected acceptance criteria before implementation. Do not mark a requirement done based only on docs, route existence or a mock-only happy path. This plan assumes SupaStore remains the chosen base; reassess only if measured constraints or a concrete missing business requirement justify migration.
