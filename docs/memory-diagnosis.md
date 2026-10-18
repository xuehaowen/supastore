# Local memory diagnosis

The [first clean standard run](representative-http-benchmark.md#clean-standard-baseline-and-memory-acceptance)
fails RSS slope and first/last-window criteria. That failure remains retained.
RSS growth alone does not identify retained JavaScript objects. No production
setting, commerce logic or resource threshold has changed during this diagnosis.

## Controlled short diagnostics

```sh
pnpm bench:representative --diagnose-memory=natural
pnpm bench:representative --diagnose-memory=gc
pnpm bench:representative --diagnose-memory=compact
```

Each creates owned synthetic services, builds both production apps, completes the
same browser and five bounded race preflights, then uses eight workers with the
same request mix for 30 seconds warm-up and 120 seconds measurement. They do not
replace the standard workload. `environment.diagnostics` makes memory acceptance
`inapplicable`; the HTTP result alone is not certification.

Only the application server processes load the numeric heap probe. It records
RSS, heap used/allocated/physical bytes, heap limit, external/ArrayBuffer bytes
and context counts every ten seconds; no request content, URLs, headers, cookies
or heap snapshots are retained. `gc` exposes and invokes explicit collection
after warm-up starts. Startup/browser traffic is never forced to collect.
`compact` uses natural collection and adds only `--max-semi-space-size=16` to
each server. Build, seed and provider processes do not receive those arguments.

Windows private committed bytes (`PrivateMemorySize64`) are separate from
working-set RSS. They are not physical/private resident memory or Linux PSS.
Database figures sum the same observed processes for each metric; RSS can count
shared pages repeatedly. Linux private counters are omitted rather than invented.

Phase markers use atomic directory creation. Measurement takes precedence over
warm-up, so readers cannot parse partial JSON or move backward. The earlier
file-replacement experiment failed Windows concurrent reads with EPERM and was
replaced. A real child-process regression publishes 500 times and verifies valid,
monotonic reads before awaiting child cleanup. Historical commit `4e968b2` has a
premature GREEN label; `0439f39` explicitly corrects it with actual passing
evidence. No history was rewritten.

## Retained observations

All runs use Windows/Next CLI, Node v24.12.0 and Next 15.5.27 on the same host.
Each manifest records its clean code commit, fixture and runtime. These sequential
short trials do not control other host activity or establish throughput parity.
The figures below are final phase-labelled samples, not window medians. Each
application has 13 measurement-labelled samples; the marker remains active while
in-flight requests drain. Full timestamps and observations are retained.

| Trial     | Orders including warm-up | Measured requests/sec | Backend final RSS MiB | Storefront final RSS MiB |
| --------- | -----------------------: | --------------------: | --------------------: | -----------------------: |
| Natural   |                      816 |                110.58 |                582.95 |                   455.16 |
| Forced GC |                      740 |                101.36 |                581.04 |                   468.09 |
| Compact   |                      675 |                 89.05 |                261.39 |                   237.40 |

All three trials have zero unexpected HTTP failures and zero amount/cart/stock
mismatches; observed order counts reconcile. Browser/access preflights and the
five races pass. Explicit collection has a cost: the longest sampled GC probe is
about 30 ms backend / 22 ms storefront, versus under 1 ms for natural samples.

| Trial     | Backend heap first -> last MiB | Storefront heap first -> last MiB | Heap size limit MiB |
| --------- | -----------------------------: | --------------------------------: | ------------------: |
| Natural   |               162.23 -> 124.22 |                  113.30 -> 105.66 |                 448 |
| Forced GC |               105.17 -> 105.89 |                    65.58 -> 63.25 |                 448 |

Forced collection keeps the short-window live heap roughly flat but leaves high
RSS. Final external/ArrayBuffer counters are single-digit MiB or about 12 MiB,
far below total RSS. This does not reproduce an accumulating live-object or
large-buffer leak in this short window; it does not exclude slower retention.

In the GC trial, database gross RSS rises from 1,976.77 to 2,042.28 MiB while
private committed bytes change from 111.50 to 115.10 MiB. Gross RSS is unsuitable
as a direct estimate of unique physical database RAM. Actual target-host
container/PSS/shared-buffer accounting remains necessary.

The compact trial lowers the observed heap limit to 304 MiB. At the final
five-second process sample, backend/storefront private commitment is about
302.59/270.59 MiB versus 380.26/366.48 MiB for natural collection: approximately
20%/26% lower. The larger apparent RSS reduction also includes working-set effects;
do not promise it as equivalent physical savings. Request rate is lower in the
compact short trial, so latency/throughput and host conditions require follow-up.

Raw synthetic evidence:

- [Natural manifest](benchmarks/2026-10-17-heap/natural/manifest.json),
  [HTTP](benchmarks/2026-10-17-heap/natural/http-load.json),
  [backend heap](benchmarks/2026-10-17-heap/natural/backend-heap.jsonl),
  [storefront heap](benchmarks/2026-10-17-heap/natural/storefront-heap.jsonl),
  [RSS/private counters](benchmarks/2026-10-17-heap/natural/memory.jsonl).
- [GC manifest](benchmarks/2026-10-17-heap/gc/manifest.json),
  [HTTP](benchmarks/2026-10-17-heap/gc/http-load.json),
  [backend heap](benchmarks/2026-10-17-heap/gc/backend-heap.jsonl),
  [storefront heap](benchmarks/2026-10-17-heap/gc/storefront-heap.jsonl),
  [RSS/private counters](benchmarks/2026-10-17-heap/gc/memory.jsonl).
- [Compact manifest](benchmarks/2026-10-17-heap/compact/manifest.json),
  [HTTP](benchmarks/2026-10-17-heap/compact/http-load.json),
  [backend heap](benchmarks/2026-10-17-heap/compact/backend-heap.jsonl),
  [storefront heap](benchmarks/2026-10-17-heap/compact/storefront-heap.jsonl),
  [RSS/private counters](benchmarks/2026-10-17-heap/compact/memory.jsonl).

## Standard-duration confirmation

```sh
pnpm bench:representative --runtime-memory=compact
```

This opt-in retains the fixed 300-second warm-up, 1,800-second measurement,
workers, fixture and request mix. It adds the young-generation argument to the
servers without loading heap probes or forcing GC. `manifest.options.runtimeMemory`
records the changed configuration; the same frozen local RSS limits apply.
`default` remains the standard behavior, and combining this option with a heap
diagnostic is rejected to avoid mixing experiments. Confirmation results are
recorded after the run; no short trial establishes memory or target host acceptance.

Run `supastore_cuj_1792241570654` completed the full standard workload from clean
`022f92f`. There are 154,168 measured requests, 7,704 measured orders and 8,767
orders including warm-up. HTTP/transport errors and amount/cart/stock invariant
violations are zero; order counts reconcile. Both builds, browser/access checks
and five bounded races passed, and owned services stopped afterward.

| Service              | Original peak MiB | Compact peak MiB | Compact slope MiB/min | Compact first/last medians MiB | Same limits |
| -------------------- | ----------------: | ---------------: | --------------------: | -----------------------------: | ----------- |
| Backend              |            593.46 |           267.54 |                -0.425 |                261.91 / 230.10 | Pass        |
| Storefront           |            484.85 |           246.02 |                -0.034 |                237.66 / 224.76 | Pass        |
| PostgreSQL gross RSS |          2,487.15 |           975.50 |                 6.749 |                737.07 / 900.22 | **Fail**    |

Observed app peaks are about 55%/49% lower. Both applications pass the unchanged
local peak, slope and median-growth rules; **overall memory acceptance remains
failed** because database gross RSS exceeds slope and median-growth limits.
The database rule is not waived or silently replaced by private commitment.
Determine actual unique/container database memory on the target host before
making a capacity claim. A passing local application series is not release approval.

| Metric           | Original standard run | Compact standard run |
| ---------------- | --------------------: | -------------------: |
| Requests/sec     |                117.32 |                85.65 |
| Catalog p95 ms   |                    81 |                  121 |
| Search p95 ms    |                   123 |                  184 |
| Product p95 ms   |                    88 |                  131 |
| Cart p95 ms      |                    90 |                  133 |
| Checkout p95 ms  |                   108 |                  159 |
| Cart edit p95 ms |                    69 |                   96 |
| Quote p95 ms     |                    51 |                   71 |
| Order p95 ms     |                    86 |                  120 |

Observed request rate is about 27% lower and latencies are higher. Sequential
runs did not isolate all host activity, so this is not a causal estimate of the
flag's CPU cost. The fixed-duration compact run also completed fewer mutations;
it does not establish equal-work retention or throughput parity. Keep the option
explicit and do not change production defaults based on this Windows trial.
Repeat controlled comparisons and target-host/standalone/export/worker workloads
before adopting it for the target host.

### Sampling-boundary correction

The original compact HTTP report retains `insufficient-data`: all 360 samples
exist, but its last timestamp is `1794.9995235000001`, about 0.477 ms before the
nominal 1,795-second final sampling point. `89c0113` reproduces this boundary RED;
`ca714db` permits at most **1 ms at coverage endpoints only** to account for timer
wake-up precision. Counts, strict chronology, internal two-interval gap limits,
raw observations and RSS/slope/growth thresholds remain unchanged. Tests reject
a 2 ms endpoint shortfall, a genuinely missing final sample and a 10.0005-second
internal gap. No interpolation, timestamp rewriting or resource-limit relaxation
was used. This is an explicit analysis-policy correction after the run.

The [reviewed memory result](benchmarks/2026-10-17-compact-standard/memory-reviewed.json)
is separate from the [original HTTP report](benchmarks/2026-10-17-compact-standard/http-load.json).
Reproduce the reviewed result without services (expected exit **2** for database
growth, with each application passing):

```sh
pnpm bench:memory:analyze docs/benchmarks/2026-10-17-compact-standard/memory.json
```

The [manifest](benchmarks/2026-10-17-compact-standard/manifest.json),
[unmodified memory series](benchmarks/2026-10-17-compact-standard/memory.json),
[raw per-phase process samples](benchmarks/2026-10-17-compact-standard/memory.jsonl),
[browser results](benchmarks/2026-10-17-compact-standard/browser.json),
[races](benchmarks/2026-10-17-compact-standard/races.json) and
[fixture](benchmarks/2026-10-17-compact-standard/fixture.json) remain inspectable.
Final regression: 1,142 unit/library tests pass; root/application types, repository
lint and formatting pass. Review found no remaining implementation/evidence issues.
