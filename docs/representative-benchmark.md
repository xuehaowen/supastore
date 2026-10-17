# Representative benchmark protocol and progress

Step 3 is in progress. This change provides the versioned protocol and memory
analysis, not an executable representative-load runner or capacity evidence.
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
expected record counts. It does not create records. Actual seed generation,
image dimensions/payloads, stock replenishment and historical ledger creation
remain to be implemented and verified against PostgreSQL.

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

For each service the report retains peak MiB, ordinary least-squares slope in
MiB/minute, the first/last five-minute RSS medians and their signed difference.
The first window is `[0, 300)` seconds; the last is `(1500, 1800]`. Negative growth
is permitted. A `1e-9` absolute tolerance applies only when comparing computed
slope/growth against their limits, avoiding floating-point false failures at an
exact boundary. The peak ceiling is exact. Raw results remain unrounded.

Resource limits are intentionally `null` until a real baseline is retained and
reviewed. Complete samples therefore produce `uncalibrated`, never `pass`.
Exit codes: `0` for passing memory acceptance after calibration, `2` for
uncalibrated/incomplete/failing results, `1` for invalid input or invocation.
Every report states `scope: memory-only` and `benchmarkAcceptance: not-evaluated`:
memory results alone cannot certify traffic mix, throughput, order invariants,
authorization, browser rendering or production capacity.

The future sampler must document what PostgreSQL memory represents. A postmaster
process alone omits its workers; summing process RSS includes shared pages more
than once. Retain that measurement method in the full run manifest and use the
same method for calibration and comparison. This analyzer does not collect or
establish that measurement method.

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

Focused verification:

```sh
pnpm exec vitest run tests/unit/representative-benchmark.test.ts tests/unit/benchmark-memory-report.test.ts
```

## Remaining Step 3 work

- Seed exact catalog, category/attribute/image and established-order profiles in
  disposable owned services, refusing all other targets before any mutation.
- Connect HTTP session workers to the fixed mix; retain achieved throughput,
  latency distributions, expected conflicts and unexpected failures separately.
- Capture cold/warm browser HTML/RSC/image transfers and initial JS alongside
  the HTTP load; retain host/runtime/commit/network metadata and memory samples.
- Run separate last-unit, same-cart, slot-capacity and provider-replay races;
  verify stock/accounting/idempotency and unauthorized-access invariants.
- Execute the full standard workload, retain artifacts, then freeze numeric
  ceilings and stability limits before application optimization. An increasing
  baseline remains an open defect rather than a justification for higher limits.

No live store, customer information, provider credentials or KVM 2 deployment is
used by this tooling change. Steps 3 and 4 remain open.
