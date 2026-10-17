# Supastore platform quality enhancement plan

Prepared: 2026-10-16, America/Los_Angeles. Status: planned; implementation has not started.
Working branch: `codex/platform-quality`. Baseline: `ec68e0f`.

## Outcome

Make Supastore a dependable, easy-to-operate store for independent physical-goods merchants, with a premium storefront and measurable resource costs. Success means a new merchant can publish a product, take a test order, fulfill it and reconcile a refund without database access or coaching.

Preserve the existing two-app deployment, PostgreSQL, transactional outbox, exact money arithmetic and HTTP separation. Prefer small improvements to established workflows over framework replacement. This plan implements the current product direction; it does not supersede the authoritative [product scope](../docs/product-scope.md), [transaction contracts](../docs/transaction-contracts.md), [business workflows](../docs/business-workflows.md) or [journey catalog](../docs/critical-user-journeys.md). Update an owning document explicitly when a step changes its contract.

No general plugin system, theme marketplace, multi-tenancy, database abstraction rewrite or infrastructure migration is included. Optional rewards, credit and scheduled fulfillment remain supported. Their presentation becomes simpler; their accounting and authorization rules remain authoritative.

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

## Delivery sequence

Each numbered step is a reviewable change, split further if its acceptance work would make one PR unwieldy. Continue on this branch with focused commits; future PR creation, publishing and deployment are separate actions. No history reset is required.

| Step                                      | Priority        | Dependency | Indicative effort         | Responsible role            |
| ----------------------------------------- | --------------- | ---------- | ------------------------- | --------------------------- |
| 1. Reproducible baseline                  | P0              | None       | 1–2 engineer-days         | Platform engineer           |
| 2. Runtime API contracts                  | P0              | 1          | 3–4 days                  | Backend/storefront engineer |
| 3. Representative benchmark harness       | P0              | 1          | 2–3 days                  | Platform engineer           |
| 4. Enforced performance budgets           | P0              | 2, 3       | 2–3 days                  | Platform/frontend engineer  |
| D. Merchant discovery                     | P0 before UX    | None       | 1–2 days plus recruitment | Product owner/designer      |
| 5. Guided merchant setup                  | P1              | 1, 2, D    | 3–4 days                  | Product/frontend engineer   |
| 6. Focused daily operations               | P1              | 5          | 3–4 days                  | Product/full-stack engineer |
| 7a. Theme configuration foundations       | P1              | 2, D       | 2–3 days                  | Backend/frontend engineer   |
| 7b. Theme draft and publication           | P1              | 7a         | 2–3 days                  | Backend/frontend engineer   |
| 7c. Premium visual implementation         | P1              | 4, 7b      | 3–4 days                  | Designer/frontend engineer  |
| 8. Critical workflow boundaries           | Conditional     | 1, 2       | 0–3 days                  | Backend engineer            |
| 9. Deployment and recovery clarity        | P0 before pilot | 1, 2, 3    | 2–3 days                  | Platform engineer           |
| 10. Pilot acceptance and release decision | Release gate    | 4–9        | 3–5 days plus recruitment | Tech lead/product owner     |

Total estimate: 27–43 engineer-days, plus merchant availability. Roughly six to nine calendar weeks with a full-time engineer and part-time design/product support; not a delivery guarantee. Re-estimate theme work after the settings inventory in 7a. Steps 2 and 3 can proceed independently after baseline work. Discovery starts immediately and must finish before steps 5, 6 and 7a; missing merchant observations keep those UX gates open while independent engineering continues. Step 9 documentation inventory can start early; its implementation and acceptance require steps 2 and 3. Steps 6 and 7 can overlap if owners avoid shared UI/localization files. Parallel scheduling does not require additional agents. Final acceptance requires 7a–7c and either completion or a documented justified skip of step 8.

## D. Discover merchant needs before UX implementation

**Context and ownership:** Product owner/designer owns recruitment and moderated observation of the existing setup, order, fulfillment and refund journeys. Start alongside step 1. Engineering can prepare synthetic demo services and capture issues; nobody contacts merchants automatically.

- Select one initial merchant segment and record why its catalog, fulfillment and daily operations fit the product scope.
- Recruit three to five consenting merchants. Observe at least three completing the current core workflows before implementing steps 5–7. Record active time, completion, assistance, mistakes and confusing controls with synthetic data.
- Rank observed problems by task impact and frequency. Use those findings to select setup defaults, navigation priorities and theme presets. Retain a comparable task script for the final pilot.

**Exit:** `docs/platform-quality-discovery.md` (new) identifies the segment, observed tasks, baseline results, prioritized issues and UX decisions. Recruitment may continue for the final pilot. Missing participants leave discovery incomplete.

**Verification:** Product owner reviews the observation records and traces each proposed UX change to a finding or explicit product requirement. No automated test can substitute for these observations.

**Rollback:** Revise design decisions before implementation; discovery has no production side effects.

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

## 4. Enforce measured performance budgets

**Context and ownership:** Own bundle/performance scripts, `.github/workflows/ci.yml`, `docs/storefront-performance.md` and targeted optimizations identified by step 3. Existing measurement prints warnings only.

Tasks:

- Establish per-route initial JS limits from the fresh baseline; cover catalog, product, cart and checkout. Fail on missing routes/manifests, absolute budget breach or a greater-than-10% increase without a reviewed budget update. Keep the existing 200 KiB limit as an initial ceiling for catalog/product until measurement supports a tighter cap.
- Run deterministic bundle checks on every PR. Run representative load on scheduled/manual release checks; avoid noisy hard timing assertions on shared CI hosts.
- Proposed browser targets: LCP <= 2.5 seconds, CLS <= 0.1, and interaction latency <= 200 ms on the documented mobile profile. Lab interaction measurements are proxies; real-user INP needs field evidence. Publish targets separately from measured results.
- Agree resource ceilings from the intended host and benchmark before release; no historical ceiling is reinstated implicitly. Monitor both processes plus database/storage costs.
- Optimize only observed bottlenecks: redundant queries, image sizing, serial reads or unnecessary client code. Maintain live checkout/stock validation and privacy-safe caching.

**Exit:** A deliberate oversized fixture fails the bundle check. Passing evidence includes all four routes and the measured resource envelope. Any unmet user-experience target has an explicit release decision, owner and remediation; it cannot be reported as achieved.

**Verification:** `pnpm run build`, `pnpm run bench:storefront`, targeted cache/privacy regressions, production mobile performance journeys and standard-profile load.

**Rollback:** Revert individual optimizations. Budget changes require a recorded reason and before/after evidence.

## 5. Guide a merchant to the first test order

**Context and ownership:** Own `apps/backend/src/app/admin/setup`, setup/settings presentation, `application/use-cases/store/get-launch-readiness.ts`, localization and merchant guide. Reuse the existing readiness calculation and saved settings.

Tasks:

- Inventory current setup controls before changing them. Organize a resumable path: store identity -> fulfillment -> payment -> first product -> test order.
- Show one recommended next action and actionable missing requirements. Keep advanced tax, rewards, credit, schedules and notification-template editing available through clearly named optional sections.
- Render only fields needed by the selected fulfillment/payment configuration. Preserve existing settings when controls are hidden or omitted.
- Keep provider secrets server-side. A configuration-presence check is not evidence of working payment/email delivery.
- Run onboarding practice orders only in a separate disposable demo deployment with its own database, asset namespace, fixture credentials and sessions. Disable external notification delivery and use fake payment adapters. Show a persistent demo label and an explicit link back to the real store; no production settings, stock, ledger entries, analytics or provider credentials are copied or changed. Reuse fixture tooling and refuse non-fixture targets. An embedded sandbox inside a production store requires a separate design and estimate and is outside this plan.

**Exit:** Setup resumes after refresh; owner/staff permissions hold; existing stores retain settings. Shipping-only and pickup-only merchants reach a practice order in the isolated demo using the guide without database access. Integration checks verify demo actions cannot reach production database/storage/provider endpoints or change real inventory, reporting or financial records. Pilot target: median <= 20 minutes after demo infrastructure prerequisites are available. Actual configured-store payment/email acceptance remains a separate release gate.

**Verification:** Readiness unit tests, settings persistence/authorization integration checks and owner/staff production setup journeys, including English/Chinese and mobile.

**Rollback:** Restore previous presentation without deleting settings. Any needed fields are additive with safe defaults.

## 6. Simplify daily merchant operations

**Context and ownership:** Own admin navigation, daily queue, order workspace, checkout presentation and related UI components. Preserve workflow authorization in application use cases. The current system already has operational queues; refine them instead of building a competing dashboard.

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

## 7. Ship one premium, merchant-configurable theme in three changes

**Context and ownership:** Own storefront `catalog.tsx`, `globals.css`, product cards/detail, shared presentation primitives, content settings, public store contracts and related additive storage changes if necessary. Coordinate contract edits with step 2. Preserve the separate admin visual system.

### 7a. Theme configuration foundations

Tasks:

- First produce and review a design reference for home, product, cart and checkout at 375px and 1440px. Use real representative product imagery and both short/long copy. Record design decisions before implementation.
- Inventory existing branding support. Add only missing typed settings: hero image/text, brand colors, typography preset and a small ordered set of curated sections such as hero, featured collection and store information.
- Offer two or three typography/color presets within one maintained theme. No arbitrary CSS/HTML execution, layout builder or component marketplace.
- Render usable defaults for existing stores and optional/hidden sections. Validate color contrast and content/image limits; reuse established storage upload validation.
- Define a separate versioned presentation configuration containing only branding and curated visual content. Currency, tax, rewards, fulfillment, ordering/pause controls, setup flags and checkout quote versions are excluded from draft/publish data and writes. Publishing a theme must never restore or modify commerce settings.

**7a exit and verification:** Inventory and schema design reviewed; additive migration/defaults and contract tests pass for existing stores and both apps. Re-estimate 7b/7c from the actual model. Rollback reverts consumers while retaining compatible additive data.

### 7b. Theme draft, preview and publication

- Add owner preview and explicit publish semantics for the presentation configuration only. Keep unpublished edits out of public caches and unauthenticated responses.
- Publish a complete presentation snapshot atomically, with a presentation revision check that rejects conflicting edits. Preview requires owner authorization and no-store responses. Invalidate affected layout, catalog and product caches consistently; public reads see only a complete published presentation revision. Test two concurrent editors and a failed publish.
- Test drafting a theme, concurrently changing tax and pause settings, then publishing: the new commerce settings and checkout quote version must remain untouched. Test schema validation rejects commerce keys in presentation updates.

**7b exit and verification:** Focused authorization, transaction, conflict, cache and mixed-version tests pass. Drafts stay private; failed publication leaves the prior published snapshot intact. Rollback selects the prior compatible presentation revision without reverting commerce data.

### 7c. Premium visual implementation

- Implement the reviewed references and presets using 7a/7b configuration and existing presentation primitives. Avoid adding a second settings or publication mechanism.
- Verify product imagery, variant selection, stock feedback, totals, trust/policy information, loading/error/empty states and reduced motion.

**Exit:** Merchants can brand the storefront without code. Existing stores render with compatible defaults. EN/ZH, keyboard navigation, focus management, 200% zoom, reduced motion and mobile layouts are verified. Draft changes remain private. Published changes appear within the documented cache interval. Performance budgets pass.

**Verification:** Settings validation/draft authorization tests; storefront contract checks; theme screenshot comparisons; product/cart/checkout browser journeys; automated axe checks plus a documented human keyboard/screen-reader pass.

**Rollback:** Restore the default theme or prior published presentation revision; retain stored content. Any schema migration is additive and compatible with the prior app during rollout. Never restore commerce settings as part of theme rollback.

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

## 9. Make deployment and recovery predictable

**Context and ownership:** Own deployment/maintenance docs, health/diagnostic presentation, ingress configuration checks and container acceptance scripts. Reuse `instrumentation.ts`, worker health, existing durable leases and restore tooling.

Tasks:

- Document the recommended small-store topology: long-running backend with worker enabled, storefront, PostgreSQL and configured asset/email services. Record cold/warm footprint and backup requirements together.
- Explain process-local rate limits and trusted-edge IP handling. Verify spoofed headers are stripped and mutation-origin rules still hold. Require shared ingress enforcement before claiming multi-replica abuse protection; do not add Redis automatically.
- Document backend/storefront mixed-version rollout and rollback from step 2. Keep worker startup, graceful shutdown, leases and multiple-worker coordination explicit.
- Surface existing worker progress, failed/exhausted notification work and payment review through actionable diagnostics. Never expose secrets or private order details publicly.
- Rehearse upgrade, database/assets restore with outbound delivery disabled, backend outage, worker failure and corrected recovery. Confirm readiness alone does not imply successful external delivery.

**Exit:** A contributor installs the synthetic demo from a clean checkout and completes the documented upgrade/restore. Multiple worker instances do not double-post financial effects. Recommended hosting constraints and scaling limitations are stated with evidence.

**Verification:** `pnpm run test:containers`, worker coordination integration tests, proxy/header regressions, restore rehearsal and `pnpm run check:services` for configuration presence. Real provider acceptance requires a designated authorized environment and separate evidence.

**Rollback:** Revert diagnostics/configuration additions; retain previous compatible deployment settings. Restore rehearsal uses isolated fixtures.

## 10. Pilot, measure and decide release readiness

**Context and ownership:** Tech lead/product owner owns recruitment, task observations, issue triage and final evidence. Engineering owns fixes. Use existing journey IDs rather than inventing a second acceptance system.

Tasks:

- Re-engage the three to five merchants recruited in discovery, using the selected segment and comparable task script. Include representative shipping/pickup usage within that segment. Record prior exposure and add fresh participants where possible to distinguish learning from product improvement. Arrange human participation; do not assume access to merchants or contact them automatically.
- Observe publish -> test order -> payment -> fulfillment -> refund. Record completion, elapsed active time, assistance, confusion and errors. Do not collect real customer data for a synthetic pilot.
- Agree measurement events: setup started/completed, first product published, first test order, checkout begun/submitted/recovered, order fulfilled and refund reconciled. Start with synthetic tests and moderated observations; real behavioral telemetry needs an explicit deployment/privacy decision.
- Proposed pilot goals: >= 80% complete setup and core tasks without coaching; median first demo order <= 20 minutes after disposable demo infrastructure prerequisites; ordinary fulfillment/refund task <= 2 minutes. Report counts and individual observations against discovery results because this sample is too small for statistical claims. These demo timings do not measure production installation or provider setup.
- Measure checkout completion and abandonment reasons descriptively; do not promise a conversion improvement without a real baseline and sufficient sample.
- Fix pilot blockers, repeat affected journeys and publish results with commit, environment, limitations and remaining work in `docs/platform-quality-release-evidence.md` (new).

**Exit:** No unresolved critical/high issue affecting money, privacy, inventory correctness, order access or core task completion. Required automated checks pass. Every performance/resource target is measured or explicitly unresolved. Human accessibility review and real payment/email acceptance are recorded before a production launch claim. A designated owner makes the release decision; missing participants, hosting or provider credentials leave the corresponding gate open.

**Verification:** Final relevant suites, production builds, performance budget artifacts, restore/upgrade evidence, pilot observation report and provider acceptance evidence. Run broad checks once at integration, then rerun affected checks after fixes.

**Rollback:** Pause new orders if needed while preserving existing order work. Use the last compatible application release; do not roll back financial data. Reconcile uncertain external operations before resuming them.

## Completion tracking and plan changes

- [ ] D. Initial segment selected and current merchant workflows observed
- [ ] 1. Baseline reproduced and required checks passing
- [ ] 2. Runtime contracts and mixed-version behavior verified
- [ ] 3. Representative read/mutation benchmarks retained
- [ ] 4. Performance budgets enforced and resource envelope published
- [ ] 5. Guided setup verified
- [ ] 6. Daily operations and checkout refined
- [ ] 7a. Presentation configuration/defaults isolated from commerce settings
- [ ] 7b. Draft privacy, publication concurrency and cache consistency verified
- [ ] 7c. Premium visual implementation and accessibility verified
- [ ] 8. Critical workflow changes independently reviewed, or justified skip recorded
- [ ] 9. Deployment/restore/worker evidence retained
- [ ] 10. Pilot and release decision recorded

For every completed step, append commit IDs, commands, results and evidence links. If scope, dependencies or targets change, record the reason and effect on subsequent steps here. Split steps that mix behavioral financial changes with cosmetic work. Never mark a step complete from a checkbox or old evidence alone. External or human gates stay open until verified; continue independent engineering work while arranging them.

Review revision: isolated onboarding practice in disposable demo services; separated presentation publication from commerce settings; specified the standard load profile and pre-optimization numeric acceptance; moved discovery ahead of UX; split theme work into 7a–7c and revised estimates; made financial refactoring conditional on demonstrated need. Implementation remains unstarted.
