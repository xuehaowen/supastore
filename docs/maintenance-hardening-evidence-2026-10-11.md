# Hardening verification: 2026-10-11

This is synthetic local evidence, not a production launch approval.

## Changes

- All repository formatting reconciled; CI now gates lint, formatting, coverage and high/critical production dependency advisories.
- Production dependency audit changed from 38 advisories to zero. Patched ORM, Next, next-intl, mail and testing dependencies; compatible transitive overrides are locked. The unused generator dependency was removed after preserving its exact stylesheet and MIT license under `src/styles/vendor`.
- pnpm 11.0.9 and Node >=22.13 are explicit. Docker Node, PostgreSQL, object storage and optional database-tool images have registry-resolved immutable digests.
- Browser/provider HTTP clients have deadlines and bounded JSON reads. Provider status decoding rejects coerced values; payment errors retain structured event/attempt context.
- Browser fixtures create unique owned PostgreSQL directories, bound startup waits, guard cleanup paths and suppress inherited live Stripe/Telnyx credentials.
- Category selectors fetch 50 candidates and retain selected records independently. Owner-only search covers categories outside that initial batch.
- Sitemap application queries use pure pagination contracts separately from HTTP serialization. UI class merging has one owner; customer i18n continues to use the existing shared package.
- Service runtime heaps default to 256 MiB with Compose overrides. Builds retain their normal memory allowance.

The development-only braces 3.0.3 parser has a reproducible local patch limiting nesting to 100 levels. Its ordinary-glob and adversarial-nesting tests pass. The upstream 3.0.4 patch version was not published when checked, so the registry still reports one development advisory; it is not suppressed.

## Completed local checks

- 121 PostgreSQL integration regressions passed after dependency and category-query changes.
- 852 backend/storefront unit tests passed. Domain coverage: statements 93.58%, branches 91.52%, functions 98.8%, lines 93.70%.
- 18 selected production root-app browser tests passed, including category search, report export, manual orders, workflow context, checkout and sitemap.
- 11 cross-service production browser tests passed, including Chinese checkout, shipping policies, credit, account history, evidence, delivery, returns and refunds.
- Frontend request coverage also passed at 100% lines and 98.46% branches. Both application type checks, lint and repository formatting passed. Frozen installation succeeded. Production audit reported no advisories.

The current synthetic Windows Node 24.12 Next CLI workload with a 256 MiB heap
recorded backend RSS 584.5 MiB / peak 616.7 MiB, and storefront RSS 238.6 MiB /
peak 262.3 MiB. This includes CLI/configuration startup and native allocations;
it does not establish the Linux standalone/container footprint. No 512 MiB
backend acceptance claim is made.

Compiled storefront initial route JS, summing per-chunk gzip, measured 132.7 KiB
for the home route and 152.6 KiB for the product route. Browser cache, RSC payloads,
lazy chunks and actual transfer compression are separate measurements.

## Reproduction and remaining acceptance

The continued scale-verification batch passed 123 isolated integration tests,
including two added 10,000-row regressions. The catalog regression runs two
100-item page reads concurrently with a complete 10,000-variant CSV export and
checks uniqueness and page separation. The reporting regression runs two
100-row pages concurrently with a complete 10,000-adjustment CSV spool, checks
full totals and removes temporary files. These establish synthetic concurrent
correctness, not production query plans, export latency percentiles or service
RSS under a merchant-sized workload.

`pnpm bench:memory` now invokes the existing real-process production fixture.
The former allocation-only script has been removed. Linux standalone and
Windows Next CLI measurements retain their documented platform limitations.

The production fixture now also exercises 10,000 products/variants and 10,000
outside-report adjustments through actual service HTTP routes: two catalog
pages, two owner report pages and a CSV export run concurrently. It verifies
100-item pages, complete unique CSV evidence, private export caching and the
last report page. This scenario passed locally in 2.6 seconds, excluding fixture
seeding/build time; its dedicated Windows Next CLI run recorded backend peak
RSS 349,425,664 bytes (333.2 MiB), storefront peak 139,284,480 bytes (132.8 MiB).
The default memory fixture includes this scenario alongside the customer
journeys; Linux standalone results are logged by CI. The database/browser RSS,
30-minute mixed read/write load and target deployment still require separate
measurements.

Linux GitHub CI now verifies production builds, coverage, PostgreSQL 17/18,
121 integration tests, and container smoke, upgrade and recovery acceptance.
The synthetic container read load completed 22,739 requests at concurrency
eight over 120 seconds, with zero failures and per-route p95 of 48–100 ms.
This is a synthetic read workload, not production-sized report/export acceptance.

The Linux Node 22.23.3 standalone fixture passed all 11 cross-service browser
journeys. Backend RSS was 274,178,048 bytes (261.5 MiB), peak 308,305,920 bytes
(294.0 MiB); storefront RSS was 185,704,448 bytes (177.1 MiB), peak 185,786,368
bytes (177.2 MiB). Both runtime processes used the default 256 MiB heap budget.
Home/product initial route JS measured 132.1/152.2 KiB gzip. These measurements
support the lightweight target for this fixture only.

These results are recorded in [CI run 38156384993](https://github.com/xuehaowen/supastore/actions/runs/38156384993).
That run also exposed stale root-browser assertions, subsequently corrected and
verified locally. The complete suite's current status is available in
[draft PR #5](https://github.com/xuehaowen/supastore/pull/5).

1. Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm typecheck:storefront`, `pnpm lint`, `pnpm format:check`, `pnpm test:coverage` and `pnpm audit --prod --audit-level high`.
2. Run `node scripts/test-integration.mjs` against its owned local cluster. Run the new PostgreSQL 17/18 CI matrix before extending deployment compatibility claims.
3. Run `node scripts/test-storefront.mjs --measure`. Linux measures generated standalone processes; Windows measures Next CLI because standalone tracing requires symlink privileges. Neither mode weakens native-loader or filesystem checks.
4. Run `pnpm test:containers` on an isolated Docker runner. The local Docker daemon was unavailable; CI now includes this existing smoke/upgrade/recovery command. Check image readiness, runtime role, persistence, rollback and backup/restore before deployment.
5. Measure Linux standalone/container RSS and concurrent merchant-sized reports, XLSX/CSV exports, worker batches and database plans within the configured limits. Heap limits do not bound total RSS. Adjust `BACKEND_NODE_OPTIONS` and `STOREFRONT_NODE_OPTIONS` only using measured deployment evidence.
6. Rehearse production-copy restore with outbound delivery suppressed. Verify authoritative Stripe/SMTP receipts, TLS/callback/origin handling, hosting cutover and human screen-reader/language acceptance with authorized production access.

On Windows, native SWC requires a privately owned cache with trusted ancestor
permissions. Use a validated `SWC_NATIVE_BINDING_CACHE`; this environment used an
owner-only directory directly under the user profile. Its default AppData cache
and standalone symlink permissions were unsuitable. No system-wide permission
or loader-security bypass was applied.

Build and browser trace artifacts remain in ignored fixture/cache directories
for diagnosis. PostgreSQL fixture directories are removed after successful
shutdown. An interrupted process can leave an orphan, but subsequent runs use
fresh directories.
