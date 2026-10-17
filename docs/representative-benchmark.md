# Representative benchmark protocol and progress

Step 3 is in progress. The versioned protocol, isolated catalog/order fixture
generator, production HTTP load runner and memory analysis are implemented.
The clean standard-duration HTTP run, browser preflight and bounded races pass.
Local resource limits are frozen; retained memory growth fails stability.
These results do not establish production capacity.
The earlier one-product smoke measurements remain diagnostic only.

## Fixed workload

The source of truth is [protocol.ts](../scripts/benchmark/protocol.ts), version 1.
The standard profile has 1,000 products, four variants and two images per product,
10,000 historical orders, eight session workers, 300 seconds of warm-up and
1,800 seconds of measurement. Memory sampling is every five seconds.

| Operation      | Request share |
| -------------- | ------------: |
| Catalog read   |           30% |
| Search read    |           20% |
| Product read   |           15% |
| Cart read      |           10% |
| Checkout read  |            5% |
| Cart edit      |           10% |
| Quote creation |            5% |
| Order creation |            5% |

`fixtureProfile()` validates 100/1,000/10,000-product profiles, shipping/pickup/mixed
fulfillment and boolean rewards/stock options, returning seed `20261016` and
expected record counts. The generator below creates these records in owned
fixtures. Each sustained run recreates owned stock with one million units per
variant before history; no live inventory or in-run replenishment is used.
See the [HTTP runner and retained baseline](representative-http-benchmark.md).

## Reproduce and verify the data fixtures

```sh
pnpm bench:fixture
```

This runs the existing embedded PostgreSQL integration harness, creates fresh
databases, migrates them, seeds and validates each profile, then drops only those
owned databases and stops the test cluster. It does not attach to an existing
store or retain a running deployment. Windows requires the normal process
permissions already documented for integration tests; sandbox-denied process
or loopback operations are infrastructure failures, not product regressions.

The reusable [seed function](../scripts/benchmark/seed.ts) requires an explicit
connection and a matching UUID ownership token in `benchmark_fixture_ownership`.
Before connecting it accepts only PostgreSQL on literal `127.0.0.1`, fixture
ports 25438/25449, synthetic credentials and `supastore_cuj_<13 digits>` database
names. URL query overrides and fragments are refused. It checks the actual
connected database/address/port, locks the ownership marker and requires an empty
store/catalog/order set before inserting. The entire seed is one transaction:
wrong ownership or an insert conflict cannot partially populate commerce data.
It never truncates records or resets financial history; a second seed is refused.

Validated profiles:

| Products | Variants | Images | Fulfillment | Rewards | Tracked stock |
| -------: | -------: | -----: | ----------- | ------- | ------------- |
|      100 |      400 |    200 | Shipping    | Off     | Off           |
|    1,000 |    4,000 |  2,000 | Mixed       | On      | On            |
|   10,000 |   40,000 | 20,000 | Pickup      | Off     | On            |
|      100 |      400 |    200 | Mixed       | On      | Off           |

Each has eight categories, two filterable attributes, four values and complete
product/variant option associations. Combination identities come from the real
domain generator. Catalog/history identities, names, prices, associations and
historical dates derive from fixed recipes and seed `20261016`; infrastructure
ownership and default configuration timestamps are allowed to vary per run.

Each profile has 10,000 closed guest orders: 8,000 completed and 2,000 cancelled.
They include converted carts, expired quotes, order items, complete frozen terms,
receipts/funding for completed orders, fulfilled pickup records or delivered
shipments, and consumed/released stock reservations where tracking is enabled.
Stock movements reconcile to on-hand balances; outstanding reservations are zero.
Tracked variants begin with 1,000,000 units before historical sales. These are
bulk synthetic ledger fixtures, not evidence of 10,000 successful checkout API
calls. Guest history receives no customer reward credit, including with rewards
enabled. No delivery events are enqueued and no payment/email provider is called.

Successful checks retain machine-readable fixture metadata under ignored
`.tmp-cuj/benchmark-fixtures/*.json`, marked `fixture-verification-only`. The
test command's exit status remains necessary evidence; the files alone do not
certify benchmark acceptance.

Two deterministic 1200 × 900 RGB PNG payloads are 82,071 and 82,077 bytes. Reports
record their SHA-256 digests. Every product has two distinct immutable asset URLs;
the synthetic S3 fixture serves shared buffers only with `BENCHMARK_IMAGES=true`.
It therefore avoids retaining a separate physical copy for every URL. Normal
storage tests retain missing-image 404 behavior. Actual GET bytes and HEAD
metadata are checked through HTTP. Synthetic texture/compression and local S3
behavior do not model real product photography, remote storage or mobile latency.

## Production HTTP workload

Use `pnpm bench:representative --smoke` for fresh production builds and a short
diagnostic, or `pnpm bench:representative` for the fixed 35-minute workload.
The [runner guide](representative-http-benchmark.md) defines options, artifact
formats, admission-window throughput and the limits of the initial measurement.
It reuses the owned fixture lifecycle and disables external delivery/providers.

## Retained memory analysis

```sh
pnpm bench:memory:analyze path/to/memory.json
```

This command reads one local JSON file (at most 8 MiB), makes no network requests
and changes no services or database records. The artifact format is:

```json
{
  "protocolVersion": 1,
  "phase": "measurement",
  "environment": {
    "platform": "win32",
    "runtime": "Next CLI",
    "products": 1000,
    "fulfillment": "mixed",
    "rewards": true,
    "trackedStock": true
  },
  "services": {
    "backend": [{ "elapsedSeconds": 0, "rssBytes": 209715200 }],
    "storefront": [{ "elapsedSeconds": 0, "rssBytes": 209715200 }],
    "postgres": [{ "elapsedSeconds": 0, "rssBytes": 209715200 }]
  }
}
```

The one-point example deliberately produces `insufficient-data`. Supply full
series for each service, with timestamps relative to the start of measurement;
exclude warm-up. No caller-supplied duration or resource limit is accepted.
Incompatible versions, missing services, unknown keys and malformed observations
are rejected. Samples must be strictly chronological, finite and positive in RSS,
and lie within the measurement interval. The first/last observations must fall
within one sampling interval of their boundaries, at least 90% of the nominal
samples must exist, and gaps cannot exceed two intervals. Do not interpolate
missing observations to obtain a passing report.

Coverage endpoints permit at most 1 ms of timer precision (`ca714db`); raw
timestamps, sample-count requirements and internal gap limits remain unchanged.
The [compact runtime confirmation](memory-diagnosis.md#sampling-boundary-correction)
records the actual 0.477 ms boundary case and preserves its original result
separately from reanalysis. Resource thresholds are unchanged.

For each service the report retains peak MiB, ordinary least-squares slope in
MiB/minute, the first/last five-minute RSS medians and their signed difference.
The first window is `[0, 300)` seconds; the last is `(1500, 1800]`. Negative growth
is permitted. A `1e-9` absolute tolerance applies only when comparing computed
slope/growth against their limits, avoiding floating-point false failures at an
exact boundary. The peak ceiling is exact. Raw results remain unrounded.

Resource limits were `null` before the retained baseline. The CLI now applies
frozen per-service limits only when artifact environment fields match the
documented local calibration. Other or unspecified environments return
`inapplicable`; generic analysis without limits still returns `uncalibrated`.
Exit codes: `0` for passing memory acceptance after calibration, `2` for
inapplicable/uncalibrated/incomplete/failing results, `1` for invalid input or invocation.
Every report states `scope: memory-only` and `benchmarkAcceptance: not-evaluated`:
memory results alone cannot certify traffic mix, throughput, order invariants,
authorization, browser rendering or production capacity.

The sampler must document what PostgreSQL memory represents. A postmaster
process alone omits its workers; summing process RSS includes shared pages more
than once. Retain that measurement method in the full run manifest and use the
same method for calibration and comparison. The HTTP runner now records its gross
RSS method in the manifest. The offline analyzer does not establish the
correctness of the supplied measurements.

## Verification retained so far

- RED `4027ca5`: missing protocol; GREEN `8d59139`; type refinement `8ab894c`.
- RED `82268b9`: missing artifact validation; GREEN `150230d`.
- RED `43a50e4`: an exact 1 MiB/minute slope falsely failed its ceiling;
  GREEN `10106cf` fixes comparison precision without loosening peak limits.
- 50 focused tests pass. Protocol/report coverage: 100% statements, lines and
  functions; 95.45% branches. The deliberate-growth control grows by 2 MiB/minute
  while staying under a 512 MiB peak, and correctly fails both slope and median
  growth limits. Test limits are synthetic controls, not production budgets.
- Actual CLI invocations confirmed a stable synthetic full series exits `2`
  (`uncalibrated`) and a missing-service artifact exits `1`. These exercise the
  analyzer only and are not measurements of either app.
- Full unit/storefront-library suite: 1,072 tests passed in 120 files. Root and
  both application typechecks passed. Independent TypeScript review found the
  rounding issue above and confirmed its fix with no remaining findings.
- Fixture RED `8add544` / GREEN `a4a31ca`: owned catalog and balanced historical
  ledgers. Storage RED `0f1fbb4` / GREEN `776bf5d`: actual benchmark image bytes.
- Review-driven RED `22b758e` / GREEN `fc1c7cf`: complete historical API terms and
  canonical variant identities. Profile matrix RED `35bab47` / GREEN `73205e1`:
  commerce policy is a JSON object rather than a double-encoded string.
- Six PostgreSQL fixture checks cover all three catalog sizes, fulfillment and
  option configurations, ownership refusal, repeated-seed refusal and atomic
  rollback after a later insert conflict. Historical terms pass the shared page
  decoder; amounts, funding and stock balances reconcile.
- Focused generator/safety coverage run: 20 tests passed, 98.03% lines, 96.87%
  branches and 91.66% functions for the measured TypeScript tooling. PNG payload
  structure/decompression and enabled/disabled storage HTTP behavior also pass.
- Fixture milestone full regressions: 1,087 unit/storefront-library tests in 122
  files and 142 PostgreSQL integration tests in 20 files pass. Root/backend/
  storefront types, repository lint and formatting pass. Independent TypeScript
  review confirmed both fixture contract fixes with no remaining findings.
- HTTP tooling: RED `ccbc88b` / GREEN `53bd1c6` covers the fixed cycle, bounded
  histograms and option validation. RED `684868f` / GREEN `9a6b3a9` verifies
  ownership before migrations. Production integration is committed in `d12fad8`.
  Fifteen focused tests pass; workload-helper coverage is 96.62% lines, 97.46%
  branches and 100% functions. Full unit/library suite: 1,102 tests; PostgreSQL
  suite: 143 tests. Independent final review has no findings.

Focused verification:

```sh
pnpm exec vitest run tests/unit/representative-benchmark.test.ts tests/unit/benchmark-memory-report.test.ts
```

## Remaining Step 3 work

- Independent contributor reproduction remains pending; commands and public
  synthetic artifacts are retained in the guide below.
- Memory stability is an open Step 4 issue. Diagnose growth and rerun the same
  standard profile after fixes; do not relax limits to accept this baseline.
- Larger-profile capacity and KVM 2 host acceptance remain unclaimed. Fixture
  generation covers all sizes; the full HTTP measurement covers 1,000 products.

The [clean 35-minute baseline and calibrated limits](representative-http-benchmark.md#clean-standard-baseline-and-memory-acceptance)
retain all three 360-sample memory series. The deliberate-growth control fails
even with peak headroom. General `analyzeMemory(..., null)` still reports
uncalibrated, while the versioned CLI now applies each frozen service limit.

No live store, customer information, provider credentials or KVM 2 deployment is
used by this tooling change. Steps 3 and 4 remain open.

Memory follow-up: [numeric heap/private-memory diagnosis and compact runtime trial](memory-diagnosis.md).
The candidate completes the full standard workload with zero correctness errors;
both app RSS series pass the frozen local rules, while database gross RSS still
fails growth. Measured throughput is lower. No production default or release
acceptance changes; target-host accounting and tradeoff validation remain open.
