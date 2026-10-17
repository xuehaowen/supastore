# Representative HTTP benchmark

This is the HTTP workload component of [Step 3](representative-benchmark.md).
Its initial short diagnostic passes. Standard-duration measurements, browser
transfers and bounded races are verified; local resource ceilings are frozen,
while measured memory stability remains an open issue.

## Commands

```sh
# Fresh production builds, 5 seconds warm-up and 30 seconds measured.
pnpm bench:representative --smoke

# Fixed standard profile: fresh builds, 5 minutes warm-up, 30 minutes measured.
pnpm bench:representative

# Alternate profile: standard timing, labeled profile-diagnostic.
pnpm bench:representative --products=100 --fulfillment=pickup --rewards=off --stock=untracked
```

Options are validated before fixture resources are created. Unknown/duplicate
options and custom duration overrides are rejected. The runner reuses the existing
disposable production-browser lifecycle, checks ownership before migrations,
seeds the selected profile and starts both apps bound to loopback. It supplies
synthetic services/credentials, disables external delivery and the outbox worker,
and clears Stripe/Telnyx secrets. Normal browser-test mode retains its demo seed
and delivery fixtures. Child processes and the owned cluster stop in `finally`.

Eight workers run a twenty-request shopping cycle with the versioned 80/20 mix.
Each cycle creates a fresh cart, changes quantity, reads the five storefront
document routes, creates a manual-payment quote and places an unpaid order.
Mixed fulfillment alternates shipping/pickup; variants rotate deterministically.
Only the current cart cookie is carried within a cycle; order-access cookies are
discarded. Quotes/orders must match the expected merchandise total. These
synthetic unpaid orders do not verify provider payment, confirmation, rewards
settlement or fulfillment delivery.

The mix is exact per complete cycle. Deadlines may leave partial cycles; actual
operation counts are retained. Throughput counts requests admitted before the
deadline divided by phase seconds. Responses may finish afterward; `drainSeconds`
records that tail. Latency includes consuming the full response body. Fixed-size
histograms report successful-response p50/p95 rounded up to one millisecond, with
explicit overflow beyond 60 seconds. Ordinary load expects zero conflicts.
Expected mutation-conflict classification is unit-tested; five bounded race probes
run before warm-up against separate owned PostgreSQL fixtures with fake providers.
These validate last-unit reservation/cancellation, pickup capacity/quotas,
same-cart order races, payment replay and untrusted payment events. Their report
must contain exactly the five named passing cases; an empty/skipped run fails.
Failed requests, missing operation coverage, malformed
purchase responses or reconciliation errors fail the run.

## Artifacts and interpretation

Each run retains ignored `.tmp-cuj/benchmark-supastore_cuj_<id>/` artifacts:

- `fixture.json`: profile, record counts, image dimensions/bytes and hashes.
- `manifest.json`: commit/dirty-tree flag, CPU/RAM/OS, Node/Next/runtime, local
  network profile, workload/timing and compiled catalog/product initial JS.
- `http-load.json`: phase distributions, failures, actual-order reconciliation,
  stock/amount/cart invariants and memory-analysis status.
- `memory.jsonl`: five-second samples with phase and PostgreSQL process count.
- `memory.json`: measurement-only series for `bench:memory:analyze`.
- `races-vitest.json` and `races.json`: raw and validated bounded-race evidence.
- `browser.json`: Chromium cold/warm transfers and authorization checks, completed
  before HTTP warm-up. Browser processes do not compete during measured load.

Memory collection is asynchronous. App measurements use each Node process's RSS.
Database measurement sums the postmaster and `pg_stat_activity` processes' RSS:
shared pages count repeatedly, so this is **gross RSS**, not physical RAM,
container memory or PSS. Keep the method consistent for comparison/calibration.
Sampler failure fails the load instead of silently dropping evidence.

Zero exit status certifies only this HTTP diagnostic and its checked invariants;
`benchmarkAcceptance` explicitly stays pending. Decoded HTML body sizes exclude
headers, browser script/image transfers and client-side RSC navigation. The
existing bundle script counts compiled initial chunks for two routes; four-route
budgets remain Step 4 work. The manifest records the browser version and preflight
artifact references separately from HTTP load.

Browser measurements use a 390 x 844 viewport on desktop Chromium with no network
or CPU emulation. Each of five routes has three fresh-context browser-cache-cold
loads and three warm reloads, recording TTFB, DOMContentLoaded and CDP encoded
HTML/RSC/script/image/other transfer bytes. Cold refers only to browser HTTP cache;
server caches are already warmed. p95 is the maximum of three samples, a diagnostic
rather than a statistically robust field percentile. Client navigation combines
the source catalog load, prefetch and product transition; it verifies a preserved
window marker and actual RSC traffic. All noncanceled failed resources count,
including stylesheets, fonts and fetches. No request URLs, cookies or headers are
retained. Unauthenticated order reads must return 401 and foreign-origin cart
writes 403. Ordinary browser discovery skips this benchmark-only test.

Preflight diagnostic `.tmp-cuj/benchmark-supastore_cuj_1792214089935` passed all
five races, 30 route/cache browser samples, client navigation and both access
checks. The short load completed 344 orders including warm-up with zero unexpected
failures or invariant mismatches. Transfer error accounting was subsequently
strengthened with a regression (RED `2d248db`, GREEN `1f88993`); the next standard
run must exercise that correction. Full unit/library suite: 1,114 passed.

The first standard attempt (`supastore_cuj_1792214352336`, clean `4662c16`)
stopped before warm-up: client navigation preserved the window but reported zero
RSC bytes. Its trace showed 200 RSC streams canceled by the client. The collector
had discarded bytes received before cancellation. It now retains CDP encoded
body chunks for canceled streams; completed streams still use their final total,
without double counting. Partial canceled sizes exclude response headers and are
labeled as such. The unchanged positive-RSC-byte assertion then passed in
`supastore_cuj_1792214513634`, together with all route/access checks, five races
and 344 orders including warm-up; zero unexpected failures/invariant mismatches.
The failed attempt remains evidence and does not count toward standard duration.

## Initial local diagnostic

Run directory: `.tmp-cuj/benchmark-supastore_cuj_1792212753913`.
Windows, Node v24.12.0, Next 15.5.27, Next CLI processes; Ryzen 7 9700X,
16 logical CPUs, approximately 31.1 GiB RAM; loopback without latency shaping.
The manifest marks dirty sources based on `9a6b3a9` during implementation.
This is an initial diagnostic, not a clean capacity baseline; the implementation
was subsequently committed as `d12fad8`.

- 30-second measurement: 5,552 requests, all successful, 273 new orders.
- Warm-up plus measurement: 305 orders, matching the actual database increase.
- Zero amount, cart-conversion or stock-balance/reservation mismatches.
- Six memory samples per service correctly yield `insufficient-data` for standard
  stability acceptance. Resource limits remain uncalibrated.
- Compiled catalog/product initial JS remains approximately 156.1/157.5 KiB gzip.

| Operation | p50 ms | p95 ms | Measured requests |
| --------- | -----: | -----: | ----------------: |
| Catalog   |     40 |     52 |             1,660 |
| Search    |     61 |     75 |             1,113 |
| Product   |     43 |     54 |               835 |
| Cart      |     44 |     55 |               556 |
| Checkout  |     52 |     65 |               279 |
| Cart edit |     29 |     41 |               560 |
| Quote     |     20 |     30 |               276 |
| Order     |     35 |     56 |               273 |

The observed 185.1 admitted requests/second belongs to this short local diagnostic.
It does not predict throughput on KVM 2 or over a mobile network.

Verification after integration: 1,102 unit/storefront-library tests, 143 PostgreSQL
integration tests and all 34 default production browser journeys pass. Both apps
build successfully. Root/application types, lint and formatting pass; independent
TypeScript review has no remaining findings. The default browser run also verifies
that non-benchmark seeding/delivery and explicit loopback binding still work.

## Clean standard baseline and memory acceptance

Run `supastore_cuj_1792233965529` uses clean commit `d7f2e79`, protocol v1,
1,000 products/4,000 variants/2,000 images/10,000 historical orders, mixed
shipping/pickup, rewards and tracked stock. Eight session workers ran 300 seconds
warm-up and 1,800 seconds measured. The machine/runtime/network are recorded in
the retained [manifest](benchmarks/2026-10-17-local/manifest.json).

The [HTTP report](benchmarks/2026-10-17-local/http-load.json) records 211,177
measured requests, 117.32 admitted requests/second and 10,554 measured orders.
Warm-up plus measurement produced 13,103 orders, matching the database increase.
Unexpected failures, expected conflicts, amount mismatches, stock mismatches and
cart conversion mismatches are all zero. All eight operations have coverage.
Owned services stopped and the temporary database directory was cleaned up.

| Operation | p50 ms | p95 ms |
| --------- | -----: | -----: |
| Catalog   |     61 |     81 |
| Search    |     95 |    123 |
| Product   |     67 |     88 |
| Cart      |     69 |     90 |
| Checkout  |     82 |    108 |
| Cart edit |     48 |     69 |
| Quote     |     31 |     51 |
| Order     |     55 |     86 |

The [browser report](benchmarks/2026-10-17-local/browser.json) retains all 30
cold/warm route samples plus actual client navigation and 401/403 access probes.
Cold script transfer medians range from 166,874 to 174,826 encoded bytes; catalog
and search image medians are 344,366/375,672 bytes. Warm script/image medians are
zero from cache. Local desktop Chromium with a mobile viewport is not a mobile
network/CPU test. The [five bounded races](benchmarks/2026-10-17-local/races.json)
also pass; they are separate use-case fixtures, not representative HTTP races.

Each service has 360 measured samples. After completing the baseline and before
application optimization, `33bf3bd` freezes the following local regression limits:

| Service              | Peak cap MiB | Max slope MiB/min | Max median growth MiB |
| -------------------- | -----------: | ----------------: | --------------------: |
| Backend              |          768 |               0.5 |                    16 |
| Storefront           |          640 |               0.5 |                    16 |
| PostgreSQL gross RSS |        3,072 |                 1 |                    32 |

Peak caps round above observed peaks with roughly 24–32% headroom. Stability
limits allow at most 15 MiB of linear app drift over 30 minutes, with a separate
16 MiB median check; PostgreSQL uses 30/32 MiB. These are strict local regression
rules, not KVM 2 sizing or proof of a leak. Gross database RSS repeats shared
pages; target-host physical memory/connection/cache measurements remain necessary.

| Service              | Peak MiB | Slope MiB/min | First median MiB | Last median MiB | Growth MiB |
| -------------------- | -------: | ------------: | ---------------: | --------------: | ---------: |
| Backend              |   593.46 |         12.32 |           326.86 |          565.29 |     238.43 |
| Storefront           |   484.85 |          7.12 |           332.78 |          473.63 |     140.85 |
| PostgreSQL gross RSS | 2,487.15 |         80.64 |           787.17 |        2,464.92 |   1,677.75 |

All peaks fit, but **all three services fail slope and median-growth limits**.
The [calibrated analysis](benchmarks/2026-10-17-local/memory-calibrated.json)
returns exit 2; the original HTTP report preserves its pre-calibration
`uncalibrated` result. Reproduce without a database or provider:

The tracked memory file preserves every observation and adds environment fields
derived from the retained run manifest; observations are unchanged. Scope matching requires
Windows, Next CLI, 1,000 products, mixed fulfillment, rewards and tracked stock.
Other environments/profiles and legacy unscoped files return `inapplicable` with
the explicit frozen budget scope; they cannot receive a memory pass. Future
runner artifacts include these environment fields directly.

```sh
pnpm bench:memory:analyze docs/benchmarks/2026-10-17-local/memory.json
```

This expected failing analysis is an open Step 4 issue, not a completed memory
acceptance. Diagnose app heap/native/cache retention and database shared-page
accounting, then repeat the same profile. Do not raise growth limits to pass it.
HTTP success does not certify the whole benchmark or production readiness.
Independent reproduction, larger-profile HTTP capacity and KVM 2/provider checks
remain pending. Final tooling regression: 1,118 unit/library tests pass; root/apps
types, repository lint and focused formatting pass. Environment-scope regressions
add seven cases; see the final verification record in the plan.
