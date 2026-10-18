# Local container reliability acceptance

Date: October 17, 2026, America/Los_Angeles. Application source: `8fb272c69a4518f4a710f6b76a11c88af88d058b`. Local Linux container acceptance passed; no production deployment was performed.

## Rehearsal and isolation

The installed Docker Desktop engine was started in the background after the earlier unavailable-engine result. The existing command `node scripts/test-container-acceptance.mjs` rebuilt all three images from the current checkout, then ran smoke, upgrade, database-copy recovery, backend-outage recovery and its existing 120-second read smoke. Docker Engine version: 29.7.2; container Node.js: v22.23.3. All application/migration images run as `nextjs`.

The dedicated Compose project is `supastore-codex-smoke`, using `scripts/compose.smoke.yml`, synthetic credentials/data and loopback port 3097. No production database, external provider credentials or live customers were used. The backend worker is disabled in this fixture. The runner removed its fixture containers/network on completion; an independent inventory confirmed no remaining project containers.

Review found that the original retry-count loop did not enforce its stated 30-second recovery deadline. `b3154ef` (RED) / `58bcf9f` (GREEN) adds a monotonic deadline, bounds requests and waits by remaining time, rejects late successful responses, and retains elapsed time/attempt count. Six deterministic tests pass with 100% statements/lines/functions and 90% branches for the helper. The container chain was repeated using `CONTAINER_SKIP_BUILD=true` with the same freshly verified application image IDs; only host-side recovery tooling changed. The measured confirmation is retained in `.tmp-cuj/platform-quality/reliability-deadline-containers.log`.

The complete unit/library suite now passes **1,177 tests**; canonical root/backend/storefront types, repository lint, JavaScript syntax checks and formatting pass. The earlier 143 PostgreSQL integration results are retained; application/transaction code did not change in this follow-up.

## Passing results

- Fresh backend, storefront and migrations Linux image builds and health checks.
- Catalog, API connection reuse, cart/private-order proof cookies, quote/order creation, duplicate-order retry, ownership rejection, cross-origin rejection and backend admin assets through the storefront proxy.
- Restored the synthetic baseline through migration index 28 and upgraded it to the current **40 applied migrations**. Catalog, variant, store and payment-account identities/values match their pre-upgrade fingerprints.
- A separate synthetic database dump/restore preserves exact fingerprints for **orders, order items and guest-order sessions**; migrations are reapplied successfully.
- Stopping the fixture backend makes public readiness return **502**. After `docker start` returns, the corrected poller measures healthy readiness in **984.386 ms across two attempts**, within its enforced 30-second deadline. This measures the readiness polling window, not total outage time including stop/start commands.
- The existing 120-second, eight-worker read smoke completes **23,803 requests with zero failures**, after recovery. This is a one-product fixture and establishes neither representative capacity nor target-host sizing. No standard benchmark, resource threshold or runtime optimization was changed.

The corrected-deadline confirmation repeats the full chain successfully and its read smoke completes **24,334 requests with zero failures**. Both runs clean up their fixture project. Counts are retained as separate observations, not a performance comparison.

Immutable local image identifiers (not registry publications):

| Target     | Image ID                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| Backend    | `sha256:eaebfdbbd98f15a2d5c2c7d91b04b1e2b9abbf680d47752bd1fa74b0005a2449` |
| Storefront | `sha256:c1c8a90998aa430e5fbcc9e62ecd347a0b27f1a299f9f4905f952b925705b09c` |
| Migrations | `sha256:b4d9f2197e052d35d8052f025fdb7f7028777302f7a8367e5184c9445144f69a` |

[Machine-readable acceptance summary](benchmarks/2026-10-17-reliability.json). Full synthetic output remains locally in `.tmp-cuj/platform-quality/reliability-containers.log`.

## Browser regression coverage in normal CI

The default non-benchmark selection in `scripts/test-storefront.mjs` now includes `sales-usability.spec.ts` and `ui-page-audit.spec.ts`. The existing CI invocation, `node scripts/test-storefront.mjs --measure`, therefore covers actionable setup, stock selection, copy failure/retry and responsive/accessibility checks without a separate extended command. Explicit selectors still replace the default selection; representative benchmarks retain their separate execution path.

The exact default CI command passes **43 browser tests**, including the 109-screen responsive/accessibility audit, with both fresh production builds. The four existing bundle budgets pass at catalog/product/cart/checkout **156.8/158.2/155.5/161.4 KiB gzip**. Fixture services shut down cleanly. This selection omits the six legacy M1 tests included in the earlier extended 49-test run; it does not remove any test from the previous default selection. Full synthetic output remains in `.tmp-cuj/platform-quality/reliability-default-browser.log`.

## Remaining production recovery acceptance

This rehearsal uses the container runner's `pg_dump`/SQL restore/migration path. It does not execute the production shell backup/restore procedure against a merchant backup, restore object storage, verify a paid ledger with provider evidence, test scheduled backup retention/alert delivery or exercise target host's actual ingress and supervision. Shell-script guard regressions and earlier evidence remain separate.

## Actual shell-procedure follow-up

An isolated PostgreSQL 18 Alpine fixture now exercises the actual `scripts/backup.sh` and `scripts/restore.sh` with real PostgreSQL clients. The first Linux attempt exposed Alpine BusyBox rejecting GNU-only `sha256sum --check`; RED `3cd6737` reproduces the valid-directory failure and GREEN `f7f1236` switches to portable `-c` while retaining corruption rejection. Windows checkout CRLF endings initially prevented execution; the test helper normalizes copied shell files to LF, matching the repository's existing `.gitattributes`. These failed attempts are not passing acceptance.

The successful run creates verified custom and plain SQL backups, refuses overwriting the existing directory, refuses a target with a real active PostgreSQL session, and refuses a deliberately corrupted dump. Both restore formats apply migrations successfully and preserve exact row fingerprints across products, variants, store settings, manual payment accounts and shipping zones. The custom target retains **40 migration records**. Recovery flags suppress outbound delivery and the worker. The helper sends no notifications and runs no application service.

This is a synthetic database procedure check; it adds no merchant-order, payment-ledger or asset-restoration evidence beyond the earlier separate container rehearsal. The owned `supastore-codex-backup` project and database volume were removed afterward. The helper image uses PostgreSQL clients plus Node for migrations, not the production application runtime. Full unit/library acceptance is **1,183 passing tests**, including seven shell recovery regressions. [Machine-readable summary](benchmarks/2026-10-17-shell-recovery.json). Local detailed output: `.tmp-cuj/platform-quality/cold-restore-rehearsal.log`.

Before cutover, retain a matching database/assets backup, rehearse the documented [cold restore](playbooks/disaster-recovery.md) in isolation with outbound delivery suppressed in the actual service configuration, reconcile financial/outbox state, and verify private assets/order access. Confirm real domain, provider and owner workflow acceptance. These remain open requirements rather than failures inferred from the local fixture.
