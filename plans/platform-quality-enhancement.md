# Supastore platform quality enhancement plan

Prepared: 2026-10-16, America/Los_Angeles. Status: implementation in progress; Steps 1 and 2 verified locally, Step 3 protocol/analysis and isolated data fixtures verified; representative load pending.
Working branch: `codex/platform-quality`. Baseline: `ec68e0f`.

## Outcome

The immediate milestone is Milky Bakery V2 taking real orders on KVM 2. This is a solo, part-time business delivery plan first. Success means the owner can publish the real catalog, accept payment, fulfill orders and reconcile refunds reliably, while nearby customers can discover the bakery and complete mobile checkout. Reusable platform capabilities follow demonstrated store needs.

Preserve the existing two-app deployment, PostgreSQL, transactional outbox, exact money arithmetic and HTTP separation. Prefer small improvements to established workflows over framework replacement. This plan implements the current product direction; it does not supersede the authoritative [product scope](../docs/product-scope.md), [transaction contracts](../docs/transaction-contracts.md), [business workflows](../docs/business-workflows.md) or [journey catalog](../docs/critical-user-journeys.md). Update an owning document explicitly when a step changes its contract.

No general plugin system, theme marketplace, configurable theme framework, multi-tenancy or database abstraction rewrite is included before V2 launch. Deploy the existing architecture to KVM 2. Optional rewards, credit and scheduled fulfillment remain supported; simplify their presentation where Milky Bakery needs it. Keep bakery branding/content in presentation or deployment configuration rather than adding bakery-specific rules to generic financial/domain logic.

## Baseline and evidence limits

- Source already separates domain calculations, application workflows, infrastructure and app entry points. Application workflows deliberately use Drizzle directly.
- Customer-page HTTP decoding checks selected top-level fields and casts nested data in `apps/storefront/lib/page-data.ts`.
- `scripts/measure-storefront-bundle.mjs` reports a 200 KiB warning for two routes; it does not enforce a failing budget.
- The homepage hero is embedded in `apps/storefront/app/catalog.tsx`. Existing settings and branding must be inventoried before introducing new fields.
- Some operational pages and payment workflows concentrate significant responsibility. File size is a review signal, not a reason for a blanket split.
- Backend rate limits are process-local; background jobs start through backend instrumentation. Supported ingress and worker topology need explicit operating guidance.
- Retained load evidence uses a one-product fixture. It does not establish realistic catalog capacity or concurrent-purchase throughput.
- Review-time unit run: 930 passed, four failed across three files. One fulfillment-validation expectation failed; one junction operation was denied; two recovery subprocess checks exited unsuccessfully. These are observations to investigate, not four established product defects.
- This plan does not certify rendered visual quality, current CI, real payment delivery, production capacity or accessibility with assistive technology.
- Existing discovery foundations include `app/robots.ts`, streamed `app/sitemap.xml/route.ts` and child sitemaps, `lib/customer-sitemap.ts`, product metadata/canonicals and Product/Offer JSON-LD. Their launch acceptance was missing from this plan. No Bakery/LocalBusiness implementation was identified in the inspected storefront; root metadata still defaults to SupaStore and needs review for Milky Bakery.

## Delivery sequence

Each numbered step is a reviewable change, split further if its acceptance work would make one PR unwieldy. Continue on this branch with focused commits; future PR creation, publishing and deployment are separate actions. No history reset is required.

| Step                                          | Priority                 | Dependency                               | Solo delivery scope                                  |
| --------------------------------------------- | ------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| D. Owner dogfooding                           | Continuous, non-blocking | None                                     | Use actual bakery operations to choose improvements  |
| 1. Reproducible baseline                      | Launch core              | None                                     | Reproduce failures and establish trusted checks      |
| 2. Runtime API contracts                      | Launch core              | 1                                        | Customer-page validation and compatibility           |
| 3. Representative benchmarks                  | Launch core              | 1                                        | Realistic catalog and concurrent purchases           |
| 4. Performance and discovery                  | Launch core              | 2, 3 for performance; 1 for SEO          | Budgets, indexing and local search                   |
| 9. KVM 2 deployment/recovery                  | Launch core              | 1, 2, 3                                  | Host measurements, upgrade/restore and providers     |
| 5. Bakery setup                               | Launch support           | 1, 2                                     | Fix observed setup blockers, not a generic wizard    |
| 6. Bakery daily operations                    | Launch support           | 1, 2                                     | Fix owner/customer task friction                     |
| 7. One fixed premium theme                    | Launch support           | 4 for final checks                       | Polish existing storefront without theme machinery   |
| 8. Workflow boundaries                        | Conditional              | 1, 2                                     | Refactor only for a demonstrated need                |
| 10. V2 launch acceptance                      | Release gate             | 1, 2, 3, 4, 9; applicable fixes from 5–7 | Owner acceptance on KVM 2; no recruitment dependency |
| Later: theme configuration/friendly merchants | Post-launch              | Stable V2                                | Validate demand before platform investment           |

The previous 27–43 engineer-day / six-to-nine-week estimate is withdrawn: it assumed team-style roles and over-scoped platform work. One owner performs these responsibilities in part-time sessions. Split work into changes that fit one or two available sessions, record active hours after step 1 and forecast from the actual pace. Engineer-days are not calendar days; no launch-date promise without capacity and host evidence.

Execution order: 1 -> 2/3 -> 4/9, taking only demonstrated bakery blockers from 5/6 and bounded fixed-theme polish from 7. SEO inventory, dogfooding and KVM 2 configuration inventory can start immediately. Complete the engineering core; 10,000-product results remain capacity diagnostics rather than a bakery launch promise. External merchant availability never blocks work or launch. Step 8 may be skipped with a recorded reason. Step 6 does not require completing step 5.

## D. Dogfood Milky Bakery; seek friendly merchants after launch

**Context and ownership:** The owner is the first merchant. Actual catalog maintenance, payment reconciliation, pickup/delivery operations and customer problems are the primary discovery source. This is continuous input, never a prerequisite gate for 5/6/7.

- Keep a short issue log: task, observed friction, business consequence and next small fix. Existing operational experience is enough to start; no observation quota.
- Replay risky money/stock cases against disposable fixtures. Use aggregate observations from real operations to prioritize; do not copy customer records into tests/screenshots or create synthetic purchases in the live ledger.
- After stable V2 operations, seek feedback from one or two friendly merchants if useful and authorized. No automatic outreach. Recruitment and generic onboarding percentages are not launch gates.

**Evidence and verification:** Optionally use `docs/platform-quality-discovery.md` as the owner issue log. Replay affected tasks after fixes and run relevant regressions. Missing external participants or an incomplete log never blocks independent work.

**Rollback:** Revise decisions before implementation; discovery adds no production financial side effects.

## 1. Establish a reproducible baseline

**Context and ownership:** Start at `package.json`, `.github/workflows/ci.yml`, `tests/unit/admin-request-validation.test.ts`, `tests/unit/fixture-directory.test.ts`, `tests/unit/recovery-scripts.test.ts` and `apps/backend/src/application/use-cases/fulfill-order.ts`. Own test/tooling fixes and the baseline evidence document only; defer unrelated product changes.

Tasks:

- Reproduce the four observed failures with captured commands, OS, Node/pnpm versions and isolated fixtures. Distinguish validation behavior from missing runtime configuration and operating-system restrictions.
- Fix the actual cause. Keep meaningful assertions; do not turn unexplained failures into skips. Put truly platform-specific prerequisites in the runner and document their supported execution environment.
- Run the existing type, lint, formatting, unit, integration and production browser suites. Use disposable synthetic services and a writable temporary cache.
- Record current build, bundle, memory and journey evidence with commit ID in `docs/platform-quality-baseline.md` (new).

**Exit:** Every required check has a passing result in its supported environment. Any unresolved check has an owner and explanation and remains an open gate. A clean checkout follows documented commands without manual source edits.

**Verification:** `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test:unit`, `pnpm run test:integration`, `pnpm run test:browser`, `pnpm run test:storefront`.

**Rollback:** Revert each isolated test/tooling fix. No schema changes.

## 2. Validate runtime API contracts

**Context and ownership:** Own `packages/contracts/src`, its package exports/dependencies, `apps/storefront/lib/page-data.ts`, affected backend customer-page response builders and focused contract tests. Shared TypeScript types alone do not validate JSON received over HTTP.

Tasks:

- Use the existing Valibot dependency family. Declare its runtime dependency in the contracts package if imported there; keep schema imports free of backend, database and Next.js dependencies.
- Define schemas for layout, catalog, product, cart, checkout, account, order and collection responses. Infer types from schemas where practical instead of maintaining duplicate shapes.
- Validate nested objects, nullability, ISO timestamps, money integers, quantities, status unions and finite values according to each field's existing contract. Signed credit entries must remain valid.
- Preserve public versus personalized cache boundaries. Return the existing safe 502 failure shape for invalid upstream data without exposing the response or customer details.
- Define additive compatibility: ignore permitted unknown fields, reject missing required fields and unsupported required semantics. Keep fixtures for the immediately previous supported response version and document deployment order for breaking changes.
- Keep presentation-oriented customer-page endpoints; do not add an API framework or universal repository layer.

**Exit:** Backend-produced fixtures decode successfully for every page. Malformed nested records fail safely. Additive fields remain compatible. Cookie-free public caching and uncached private reads retain regression coverage. Both apps build independently.

**Verification:** Focused decoder/producer compatibility and cache tests; `pnpm run typecheck`, `pnpm run test:unit`, `pnpm run test:storefront:unit`, `pnpm run build`. Run affected account, checkout and private-order browser journeys.

**Rollback:** Revert consumers first or release backward-compatible producers. No destructive response or database changes.

## 3. Benchmark realistic stores and purchases

**Context and ownership:** Extend existing fixture/test scripts, `scripts/measure-storefront-bundle.mjs`, storefront performance tests and fixture documentation. Reuse isolated PostgreSQL, storage and mail services. Own measurement tooling, not application optimization in this step.

Tasks:

- Provide deterministic fixture profiles: 100, 1,000 and 10,000 products; four variants per product; categories and filter attributes; representative image assets; an established order history. Use fixed seeds and report exact counts and payload sizes.
- Include shipping-only, pickup-only and mixed-fulfillment configurations with rewards on/off and tracked/untracked stock.
- Measure cold and warm catalog, filtered search, product, cart and checkout journeys. Report p50/p95, error rate, initial JS, RSC/HTML transfers, image transfer sizes and per-service memory separately.
- Add bounded concurrent mutations: same last unit, same cart/idempotency key, overlapping slot capacity and provider-event replay. Correctness checks must distinguish expected conflicts from server failures.
- Record CPU/RAM, network/latency profile, browser, runtime versions, fixture, duration and commit. Retain machine-readable artifacts.
- Fix the standard load profile before measuring: 1,000 products, four variants each, 10,000 historical orders, two representative images per product with recorded dimensions/bytes, and eight concurrent session workers. Use five minutes of warm-up followed by 30 minutes measured. The request mix is 80% reads (30% catalog, 20% search, 15% product, 10% cart, 5% checkout reads) and 20% mutations (10% cart edits, 5% quote creation, 5% order placement). Use isolated, replenishable synthetic stock for general load and separate bounded last-unit/slot races. Disable external delivery and use fake payment adapters; measure real providers separately.
- Sample per-service RSS and database/container memory every five seconds. After the baseline run and before optimization, freeze numeric resource ceilings and a memory-stability rule in versioned benchmark configuration, including the allowed slope in MiB/minute and difference between the first and last five-minute medians. Record the measured baseline and rationale; an increasing baseline does not justify declaring growth acceptable. Include a deliberate-growth control to verify the analysis catches retention.
- Require zero unexpected HTTP/transport failures and zero invariant violations. Record expected conflict statuses separately from successful throughput; authorization probes must fail as intended. Report achieved request rate and latency rather than inferring throughput from worker count. Any workload change requires a new versioned baseline.

**Exit:** Another contributor reproduces the benchmark using its versioned profile. No overselling, duplicate orders, duplicate accounting entries or unauthorized reads occur. Numeric memory-stability criteria and resource ceilings are frozen before optimization; a breach is retained as an open issue and must pass the same profile in step 4. Larger fixtures establish capacity limits, not an automatic promise to support every profile.

**Verification:** `pnpm run bench:storefront`, `pnpm run bench:memory`, `pnpm run bench:search`, plus the new documented representative-load command and relevant integration journeys.

**Rollback:** Revert harness additions. Fixtures must target disposable services and refuse non-fixture database targets.

## 4. Enforce performance budgets and verify search discovery

**Context and ownership:** Own bundle/performance scripts, `.github/workflows/ci.yml`, `docs/storefront-performance.md`, storefront SEO/metadata routes and focused discovery tests. Existing bundle measurement prints warnings only. Reuse existing sitemap/robots/canonical/Product implementations and repair gaps; do not rebuild them.

Tasks:

- Establish per-route initial JS limits from the fresh baseline; cover catalog, product, cart and checkout. Fail on missing routes/manifests, absolute budget breach or a greater-than-10% increase without a reviewed budget update. Keep the existing 200 KiB limit as an initial ceiling for catalog/product until measurement supports a tighter cap.
- Run deterministic bundle checks on every PR. Run representative load on scheduled/manual release checks; avoid noisy hard timing assertions on shared CI hosts.
- Proposed browser targets: LCP <= 2.5 seconds, CLS <= 0.1, and interaction latency <= 200 ms on the documented mobile profile. Lab interaction measurements are proxies; real-user INP needs field evidence. Publish targets separately from measured results.
- Agree resource ceilings from the intended host and benchmark before release; no historical ceiling is reinstated implicitly. Monitor both processes plus database/storage costs.
- Optimize only observed bottlenecks: redundant queries, image sizing, serial reads or unnecessary client code. Maintain live checkout/stock validation and privacy-safe caching.

### 4b. Search and local discovery for V2

- Add `/robots.txt`, `/sitemap.xml`, child sitemaps, localized home, product, category/collection and contact/policy pages to the acceptance route list. XML/text routes need status/content/indexing checks, not JS budgets. Keep cart/checkout in performance coverage; exclude private account/order/admin/recovery pages from sitemaps and indexing. Robots rules do not replace access control.
- Verify canonical URLs, hreflang, redirects and sitemap entries use the actual HTTPS production domain rather than localhost/staging. Include only published public records. Check unpublished/removed products, sitemap paging, crawler-accessible images and backend-outage behavior.
- Replace generic SupaStore metadata where it reaches bakery customers/search results. Provide clear home/collection/product titles and descriptions, factual service area, ordering lead times, pickup/delivery instructions, contact details and hours using existing content surfaces. Do not invent a city, street address, opening hours or ratings.
- Add safely serialized JSON-LD using the most specific accurate LocalBusiness subtype (`Bakery`) on the public business-information page/home when required facts are available. Match visible content and current Google requirements. The owner confirms which contact/location details may be public. Do not expose a private home/pickup address to satisfy schema requirements; if necessary public facts are unavailable, record the eligibility limitation and omit unsupported rich-result claims. Verify existing Product/Offer prices, currency and availability agree with current product/stock presentation.
- Owner verifies/connects Google Search Console, submits the existing sitemap and inspects important URLs after DNS/HTTPS cutover. Check an existing Google Business Profile's website/name/service area/hours for consistency; create one only if eligible and authorized. Track manual account actions separately from code readiness.
- Start discovery measurement with Search Console impressions/clicks/index coverage and aggregate owner order/referral observations. No new tracking SDK is required. Record baseline status and revisit after two/four weeks. Rankings, rich results, Google approval and minimum traffic counts are not launch gates.

**SEO verification:** Reuse `tests/browser/sitemap.spec.ts`, `cross-service-sitemap.spec.ts`, `tests/unit/combined-sitemap.test.ts` and storefront sitemap unit tests. Add focused rendered metadata/schema checks for EN/ZH, published/unpublished records, production origin and private-page noindex. Validate representative public pages with Google's Rich Results Test and Search Console when deployed. Staging/demo stays access-restricted and noindex; intended production landing pages are crawlable.

**References:** [Google LocalBusiness guidance](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Organization guidance](https://developers.google.com/search/docs/appearance/structured-data/organization), [Business Profile representation guidelines](https://support.google.com/business/answer/3038177).

**Exit:** A deliberate oversized fixture fails the bundle check. Passing evidence includes all four shopping routes, robots/sitemap/metadata/schema checks and the measured resource envelope. Discovery is technically ready on the actual domain; record pending account actions separately without waiting for rankings/indexing to occur. Any unmet user-experience target has an explicit release decision, owner and remediation; it cannot be reported as achieved.

**Verification:** `pnpm run build`, `pnpm run bench:storefront`, targeted cache/privacy and SEO regressions, production mobile performance journeys and standard-profile load. SEO inventory/tests may start after step 1 without waiting for the load harness.

**Rollback:** Revert individual optimizations. Budget changes require a recorded reason and before/after evidence.

## 5. Remove Milky Bakery setup blockers

**Context and ownership:** Own `apps/backend/src/app/admin/setup`, setup/settings presentation, `application/use-cases/store/get-launch-readiness.ts`, localization and merchant guide. Reuse the existing readiness calculation and saved settings.

Tasks:

- Replay the owner's current setup: store identity -> fulfillment -> payment -> first product -> controlled order. Fix observed blockers using existing forms/readiness guidance; a new generic onboarding wizard is not a launch requirement.
- Show one recommended next action and actionable missing requirements. Keep advanced tax, rewards, credit, schedules and notification-template editing available through clearly named optional sections.
- Render only fields needed by the selected fulfillment/payment configuration. Preserve existing settings when controls are hidden or omitted.
- Keep provider secrets server-side. A configuration-presence check is not evidence of working payment/email delivery.
- Reuse existing disposable fixture tooling to rehearse Milky Bakery's configured fulfillment/payment path. Isolate synthetic database, assets, credentials and sessions from production; suppress outbound delivery and use fake payment adapters. A new persistent human-facing demo, embedded sandbox and coverage of unused merchant configurations are deferred unless a demonstrated bakery blocker requires them. Never create fixture receipts in production or copy customer records into the rehearsal.

**Exit:** Owner completes actual bakery setup and a controlled fixture rehearsal without database edits. Changed forms retain omitted values, persist after refresh and preserve authorization. Verify the rehearsal cannot change production inventory, reporting or financial records. Skip unrelated setup redesign and unused fulfillment modes with a recorded reason. Actual configured-store payment/email acceptance remains in steps 9/10; no external merchant timing target gates V2.

**Verification:** Readiness unit tests, settings persistence/authorization integration checks and owner/staff production setup journeys, including English/Chinese and mobile.

**Rollback:** Restore previous presentation without deleting settings. Any needed fields are additive with safe defaults.

## 6. Fix daily bakery and customer workflow friction

**Context and ownership:** Own admin navigation, daily queue, order workspace, checkout presentation and related UI components. Preserve workflow authorization in application use cases. Prioritize issues observed in Milky Bakery operations; do not redesign every admin page. Refine existing queues instead of building a competing dashboard.

Tasks:

- Prioritize work that needs action: payment review, preparing orders, pickup readiness, dispatch, refund exceptions and failed notifications. Counts must use real authorized data.
- Give each order a clear status, permitted next action and explanation of blockers. Group exceptional financial tools behind explicit contextual entry points.
- Extract order-page sections only where they have coherent responsibilities: summary, payment, fulfillment and activity. Retain request/return context and pending/error feedback.
- Improve the customer path alongside the merchant path: preserve entered checkout data, explain changed totals, show fulfillment-relevant fields and recover lost submission responses safely.
- Preserve the original idempotency key after a lost submission response. Recover or reconcile the original attempt before creating another attempt. Verify refresh, back navigation and multiple tabs cannot duplicate an order or payment; customer access proof remains required for recovery.
- Confirm navigation simplification never removes access to existing paid-order, refund or discrepancy work when new sales or optional features are disabled.

**Exit:** Staff can locate and fulfill an eligible paid order; owners can complete an ordinary refund and find a failed email. Target ordinary tasks <= 2 minutes excluding physical handling, provider delays and exceptional investigation. No extra mandatory checkout steps. Test empty, partial, failed and permission-denied states.

**Verification:** Existing order/payment/refund/fulfillment integration tests, mobile order-workspace journeys, checkout retry/price-change journeys and `ui-page-audit.spec.ts`.

**Rollback:** Revert presentation/component changes; keep backend transaction behavior stable.

## 7. Polish one fixed premium Milky Bakery theme

**Context and ownership:** Own existing storefront `catalog.tsx`, `globals.css`, product cards/detail and shared presentation where needed. Preserve the separate admin visual system. This is bounded store polish, not theme-platform development.

- Use owner-approved real product photography, bakery copy and one coherent typography/color direction. Check home, product, cart and checkout at 375px/1440px, EN/ZH, short/long names and empty/error states.
- Prioritize product/price hierarchy, image sizing, variant/stock feedback, clear pickup/delivery/payment instructions, tap targets and fast checkout. Prefer server-rendered presentation and existing components.
- Bakery branding may be fixed in storefront source or deployment configuration. Keep provider credentials and transaction rules out of presentation code. Reuse existing content settings; no theme tables, preset library, draft storage, publication system or visual editor before launch.

**Exit:** Owner accepts the fixed storefront for selling the bakery catalog; core mobile shopping works, focus/keyboard and reduced-motion behavior remain usable, automated accessibility checks pass, and step 4 performance/discovery checks remain green. Cosmetic breadth is a backlog item, not a financial/core launch blocker.

**Verification:** Existing storefront journeys and UI audit, targeted screenshots, keyboard/screen-reader smoke checks and bundle budgets. No snapshot-only tests for incidental CSS details.

**Rollback:** Revert presentation changes to the prior fixed theme. No commerce-data or schema rollback.

## 8. Strengthen critical workflow boundaries

**Context and ownership:** Start with `application/use-cases/payments/stripe-checkout.ts`, `application/use-cases/store-credit/purchase-refund.ts` and the touched order UI. Own only extractions supported by demonstrated change risk. Use existing application ports and domain functions.

Tasks:

- First record a concrete defect, planned behavior change or demonstrated review difficulty that warrants restructuring a named workflow. File size alone is insufficient. If no such need exists, document the decision and skip this step; existing financial correctness remains more valuable than completing a refactoring quota.
- Trace authorization, validation, database transaction, provider request and settlement phases. Write down the invariants before moving code.
- Extract cohesive helpers for provider orchestration or pure decisions only when this improves independent reasoning/testing. Avoid one interface per table or a generic workflow engine.
- Preserve lock order, frozen money/terms, idempotency keys, refund entitlement, durable review states and provider I/O outside financial transactions.
- Tighten import rules where needed: domain cannot import infrastructure/application; storefront cannot import backend runtime source; shared contracts remain runtime-neutral.

**Exit:** Relevant retry, webhook replay, refund, authorization and race tests pass against PostgreSQL. Existing public behavior remains unchanged. A reviewer can locate each critical phase and its transaction boundary without following a new abstraction chain.

**Verification:** Boundary lint checks, focused financial/Stripe integration suites, existing domain coverage thresholds, type checks and affected browser journeys. Obtain an independent code review for implementation changes.

**Rollback:** Revert one extraction at a time. No financial data migration or workflow-state changes in this step.

## 9. Deploy and rehearse recovery on KVM 2

**Context and ownership:** Own deployment/maintenance docs, health/diagnostic presentation, ingress configuration checks and container acceptance scripts. Reuse `instrumentation.ts`, worker health, existing durable leases and restore tooling.

Tasks:

- Inventory actual KVM 2 CPU/RAM/disk, OS, current services, free space, backup location, expected traffic, public domain and TLS. Do not infer specifications from the plan name. Measure the standard and bakery-shaped workloads in an isolated target-host deployment, protecting existing services/data. Record CPU, per-service RSS, total host memory, disk, database connections and headroom.
- Document the recommended small-store topology: long-running backend with worker enabled, storefront, PostgreSQL and configured asset/email services. Record cold/warm footprint and backup requirements together.
- Explain process-local rate limits and trusted-edge IP handling. Verify spoofed headers are stripped and mutation-origin rules still hold. Require shared ingress enforcement before claiming multi-replica abuse protection; do not add Redis automatically.
- Document backend/storefront mixed-version rollout and rollback from step 2. Keep worker startup, graceful shutdown, leases and multiple-worker coordination explicit.
- Surface existing worker progress, failed/exhausted notification work and payment review through actionable diagnostics. Never expose secrets or private order details publicly.
- Rehearse upgrade, database/assets restore with outbound delivery disabled, backend outage, worker failure and corrected recovery. Confirm readiness alone does not imply successful external delivery.

**Exit:** Owner reproduces deployment from a clean checkout, verifies measured KVM 2 headroom and rehearses upgrade/restore before cutover. Real-domain HTTPS, origins/cookies/proxy behavior, readiness and worker checks pass. Confirm an authorized controlled payment and transactional email, not credential presence alone. Missing host/domain/provider access leaves that production gate open while local work continues. Multiple worker instances do not double-post financial effects. Recommended hosting constraints and scaling limitations are stated with evidence.

**Verification:** `pnpm run test:containers`, worker coordination integration tests, proxy/header regressions, restore rehearsal and `pnpm run check:services` for configuration presence. Real provider acceptance requires a designated authorized environment and separate evidence.

**Rollback:** Revert diagnostics/configuration additions; retain previous compatible deployment settings. Restore rehearsal uses isolated fixtures.

## 10. Accept V2 for real sales on KVM 2

**Context and ownership:** The owner makes the launch decision. No external merchant recruitment or configurable theme is required. Use existing journey IDs; retain evidence in `docs/platform-quality-release-evidence.md`.

- Complete engineering steps 1/2/3/4/9. Triage 5/6/7 against real bakery workflows: fix money, privacy, inventory, order-access, unusable mobile checkout and operational blockers before launch; defer generic onboarding and cosmetic breadth. Record a justified skip for step 8 when unnecessary.
- Rehearse on isolated services with the intended catalog/fulfillment configuration: browse -> cart -> quote -> order -> payment -> preparation -> pickup/delivery -> refund. Include changed price, last-unit contention, lost submission response, failed notification and existing-order access while new orders are paused.
- Before cutover, back up and rehearse restore; retain compatible image IDs. Verify public DNS/HTTPS, merchant content and private-page indexing exclusions. Validate an owner-authorized controlled transaction and email in the designated environment/recipient. Production smoke purchases are real audited transactions with explicit reconciliation/refund, never fixture receipts.
- Document resource headroom, failed requests and invariant checks using steps 3/4. Required correctness checks must pass; unresolved performance targets need an explicit owner decision and evidence. Missing payment, access or recovery acceptance prevents declaring production ready.
- At launch, retain an owner smoke-check record and pause/rollback procedure. During the first sales cycle, review payment/order/fulfillment failures, stock discrepancies, worker backlog, memory and customer questions. Existing order operations remain available if new sales are paused.
- Record Search Console status, sitemap submission and factual business listing configuration when account access is available. Review discovery/traffic and actual order outcomes after two and four weeks. Indexing delays, rankings and friendly merchant availability do not block technically ready sales.

**Exit:** V2 serves the intended catalog on the real HTTPS domain on KVM 2, accepts an authorized controlled order/payment, delivers its transactional email and supports owner fulfillment/refund. No unresolved critical/high issue affects money, privacy, stock, order access or core task completion. Retain automated/owner acceptance, host measurements and restore/rollback evidence. Pending external account actions are explicitly recorded, not presented as completed.

**Verification:** Final relevant suites, both production builds, budgets/discovery artifacts, KVM 2 smoke checks, provider evidence and restore/upgrade rehearsal. Rerun affected checks after fixes. Synthetic fixture and real-store data remain separate.

**Rollback:** Pause new orders if needed while preserving existing order work; restore compatible app images without rolling back financial data. Reconcile uncertain external operations before resuming them. DNS cutover, live transactions and provider/account changes require their specific authorized execution context; this plan does not execute them.

## Post-launch platform backlog

- Seek feedback from one or two friendly merchants after Milky Bakery V2 is operating. No signup/response quota.
- Only if demand warrants it, design theme configuration, draft/preview/publication and presets as separate changes. Presentation configuration must be isolated from currency, tax, rewards, pause/order controls and quote versions. Publish/rollback cannot restore commerce settings. Preserve revision checks, draft privacy, compatibility and cache-consistency requirements from the previous design.
- Consider generalized onboarding, wider UX research and conversion telemetry after an operational baseline exists. Do not install a tracking SDK just to measure search discovery. Record scope and a new solo-effort estimate before deferred work starts.

## Completion tracking and plan changes

- [x] 1. Baseline reproduced and required local checks passing ([evidence](../docs/platform-quality-baseline.md))
- [x] 2. Runtime contracts and mixed-version behavior verified locally ([evidence](../docs/customer-page-contracts.md))
- [ ] 3. Representative read/mutation benchmarks retained
- [ ] 4. Budgets enforced; robots/sitemaps/metadata and local discovery verified
- [ ] 9. KVM 2 host, deployment, providers and recovery acceptance verified
- [ ] 5/6. Observed bakery setup/operations blockers fixed or explicitly deferred
- [ ] 7. Fixed bakery storefront accepted; configuration machinery deferred
- [ ] 8. Necessary workflow changes reviewed, or justified skip recorded
- [ ] 10. Owner launch acceptance and first-sales monitoring recorded

D is continuous and non-blocking. Append commit IDs, commands, results and evidence links for completed work. Change workloads/thresholds through versioned decisions, not silent relaxation. Friendly merchants and theme configuration are post-launch improvements. Host/payment/access/recovery failures remain genuine launch blockers. Distinguish local readiness from production acceptance and external account actions.

Review revision: accepted solo-project priorities. Replaced research gating with owner dogfooding; withdrew team-based calendar estimates; retained 1/2/3/4/9 as engineering core; scoped 5/6 to bakery needs; replaced 7a–7c with one fixed theme and deferred configuration; added existing SEO foundations plus local discovery and KVM 2 acceptance.

Execution started 2026-10-16: [Step 1 baseline evidence](../docs/platform-quality-baseline.md). Commit `02c0e2b` replaces stale delivery/queue expectations with authorized PostgreSQL regressions; full unit, integration, type/lint and coverage checks pass. Both production builds and all 34 default browser journeys pass after correcting async-mail and report-label test assumptions. Process RSS and route JS samples are retained in the evidence document. Step 1 local baseline is complete; KVM 2/provider/representative-load acceptance remains in later steps. No production business logic changed.

Step 2 local acceptance completed: [customer-page contracts](../docs/customer-page-contracts.md).
RED checkpoints `b7b81ac` and `f664c71` capture absent nested decoding and the legacy
policy producer mismatch. Shared runtime validation now covers all eight pages,
with backend policy normalization and an isolated decoder export. Full unit/library
suite: 1,022 passed; fresh production browser suite: 36 passed; both builds,
root/apps types, lint and formatting passed. No initial client-JS raw-byte growth
on the measured catalog/product routes. Deployment order is backend first, then
storefront; no new data migration. Steps 3–10 remain open as scoped above.

Step 3 foundation implemented: [versioned protocol and memory analysis](../docs/representative-benchmark.md).
The standard workload and fixture counts are fixed; incomplete sampling and
uncalibrated budgets cannot pass. A deliberate-growth control and exact-ceiling
regression are verified across 50 focused tests. The offline memory artifact
command validates all three services without accepting input budget overrides.
HTTP/browser load, bounded races, sustained measurements and calibrated resource
ceilings remain pending; fixture generation is verified below. Step 3 is not complete.

Step 3 fixture generation is now verified against PostgreSQL via `pnpm bench:fixture`:
100/1,000/10,000 products, four variants and two image records each, and 10,000
closed historical orders per profile. Shipping/pickup/mixed, rewards and stock
options are covered. Tests verify ledger balances, complete API terms, canonical
variant keys, wrong-owner/repeated-seed refusal and transaction rollback. The
synthetic image server returns real deterministic PNG bytes only in benchmark
mode. Machine-readable fixture metadata is retained locally; no live store or
external provider is used. Production load-runner integration, concurrent races,
35-minute measurements and calibrated limits remain open.
