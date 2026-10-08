# Local performance and recovery gates

These gates use only `supastore-codex-smoke`, local port3097, synthetic credentials,
and disposable PostgreSQL databases. They do not read production backups or call
payment, carrier or email providers. Avoid running upgrade/recovery operations
during latency measurement; their resource use changes the measurement.

For the complete gate, set the load variables below and run
`node scripts/test-container-acceptance.mjs`. This rebuilds images, recreates only
the named disposable fixture, applies and seeds its schema, runs all four checks,
and removes the fixture in a finally block. It requires Docker daemon access.

Build with `docker compose build backend storefront migrate`, then start
PostgreSQL with `docker compose -p supastore-codex-smoke -f scripts/compose.smoke.yml up -d --wait postgres`.
Run its migration service, pipe `scripts/seed-container-smoke.sql` to the fixture's
`psql -U postgres -d supastore_smoke -v ON_ERROR_STOP=1`, and start backend and
storefront with the same project/file and `up -d --wait backend storefront`.

Run `node scripts/test-container-smoke.mjs` for checkout and cookie boundary
acceptance. Run `node scripts/test-container-upgrade.mjs` for a migration28
synthetic database dump, restore into a separate database, latest migration
upgrade, and unchanged catalog/store/payment identities. It removes its two
temporary databases. Run `node scripts/test-container-recovery.mjs` after smoke
for dump/restore fingerprint checks of order/items/private proof sessions,
non-success readiness while backend stops, and recovery within30seconds.

Set `LOAD_DURATION_SECONDS=1800`, `LOAD_CONCURRENCY=8`, and optionally
`LOAD_CONTAINER_METRICS=true`, then run `node scripts/test-store-load.mjs`.
Only localhost/127.0.0.1 origins are accepted, with1–32workers and10–3600seconds.
It reads catalog, catalog search, store settings, product and rendered homepage;
it never creates payments/orders. Every minute reports counts, failures and
optional fixed fixture Docker CPU/memory snapshots. Final output reports route
p50/p95/p99 latency and fails on any unsuccessful request. A single product fixture
measures the service boundary; it does not establish production catalog scale.

Cleanup only the fixture with
`docker compose -p supastore-codex-smoke -f scripts/compose.smoke.yml down --volumes`.
The normal developer Compose stack is separate.

The catalog response now groups translations, variant prices and cover images
once rather than scanning all related rows for every product. Migration packaging
bundles only the PostgreSQL/Drizzle runtime and SQL in a nonroot image, removing
the workspace tooling/dependency tree from the shipped migration image.
The verified migration image decreased from1.54GB to241MB.

## Verified acceptance on 2026-10-06

The final `scripts/test-container-acceptance.mjs` process exited 0. It rebuilt
backend, storefront and migration images, applied the full migration chain
through 0032, seeded synthetic data, and passed the smoke, backup/restore,
upgrade and outage checks before starting load. Its finally block removed all
fixture containers and the fixture network; the developer stack was untouched.

The upgrade gate restored a migration-0028 dump into a separate database, applied
the current chain (33 migration journal rows), and preserved catalog, variant,
store and payment-account identities and values. The recovery gate preserved
fingerprints of orders, order items and private order sessions after dump/restore
and migration replay. Public readiness returned 502 during the intentional
backend outage and recovered within the 30-second gate. Smoke also verified API
connection reuse, cart/order cookies, private tracking, order retry idempotency,
CSRF/ownership rejection, catalog/product and admin assets.

The final load used `http://127.0.0.1:3097`, 8 workers and 1,800 seconds with no
transport retries. It completed **685,003 GET requests with zero failures**,
approximately 380.6 requests/second across these routes:

| Route                              | Requests |   p50 |   p95 |   p99 |
| ---------------------------------- | -------: | ----: | ----: | ----: |
| `/api/v1/catalog`                  |  137,001 | 18 ms | 26 ms | 31 ms |
| `/api/v1/catalog?search=Fixture`   |  137,000 | 21 ms | 30 ms | 35 ms |
| `/api/v1/store`                    |  137,001 | 12 ms | 18 ms | 22 ms |
| `/api/v1/products/fixture-product` |  137,001 | 17 ms | 24 ms | 29 ms |
| `/en`                              |  137,000 | 34 ms | 52 ms | 64 ms |

Minute-level Docker memory samples after warm-up stayed approximately 427–431.2
MiB for backend, 297–305.9 MiB for storefront, and 100–101.4 MiB for PostgreSQL.
These are sampled container memory measurements, not process RSS or a guarantee
of peak allocation. The Docker host reported 15.16 GiB available; other local
build/browser checks may have shared host resources. The fixture contained one
published product and one variant, so this demonstrates a sustained functional
service boundary, not production catalog scale or real payment/write throughput.
No production backup, TLS/DNS, live provider delivery or production capacity was
verified by this run.

Earlier trials exposed two defects and are not counted as passing acceptance:
the Next rewrite proxy forwarded `Connection: close`, causing local client
`EADDRINUSE` failures as ephemeral sockets accumulated; the initial streaming
proxy retained timeout resources and plateaued around 1.55 GiB. The final proxy
strips hop-by-hop headers, preserves private cookies/signatures and clears its
deadline and client-abort listener when response streaming finishes. A preceding
five-minute diagnostic completed 102,707 requests with zero failures and stable
frontend memory around 247 MiB. The final 30-minute results above use the fixed
proxy and contain no retry masking.

Image sizes observed after this acceptance were backend **341 MB**, storefront
**323 MB**, and migrations **241 MB**. The migration image was reduced from
1.54 GB by bundling only the migration runtime and SQL and runs as a nonroot user.
Later trusted-edge IP integration is a separate short boundary validation; this
load run used the default configuration with no trusted-edge secret.

### Retained minute-level samples

All samples reported zero failed requests. Memory values below are MiB; CPU is
Docker's percentage of one core. The final sample follows completed load and
therefore reports idle CPU rather than throughput CPU.

| Elapsed s | Requests | Backend memory | Storefront memory | PostgreSQL memory | Backend CPU % | Storefront CPU % | PostgreSQL CPU % |
| --------: | -------: | -------------: | ----------------: | ----------------: | ------------: | ---------------: | ---------------: |
|        62 |    21618 |          426.6 |             230.8 |             100.3 |        121.31 |            94.18 |            53.91 |
|       122 |    43884 |          427.3 |             303.3 |             100.3 |        107.72 |            88.08 |            58.45 |
|       181 |    66205 |          427.3 |             299.6 |             101.2 |        109.99 |            96.60 |            59.57 |
|       241 |    88781 |          427.4 |             302.1 |             100.6 |        105.28 |            85.35 |            56.82 |
|       301 |   110823 |          427.9 |             299.4 |             101.3 |        111.74 |            88.49 |            58.15 |
|       361 |   133245 |          428.4 |             301.8 |             100.9 |        109.99 |            87.44 |            57.53 |
|       421 |   155481 |          428.5 |             304.5 |             100.6 |        110.35 |            96.38 |            58.15 |
|       481 |   177929 |          428.1 |             297.3 |             100.3 |        109.83 |            96.91 |            59.31 |
|       541 |   200991 |          428.1 |             298.6 |             101.0 |        109.21 |            96.18 |            60.43 |
|       602 |   223464 |          428.2 |             301.8 |             100.6 |        109.61 |            92.57 |            56.26 |
|       662 |   245326 |          428.5 |             301.3 |             100.9 |        109.81 |            90.57 |            58.24 |
|       722 |   268470 |          428.4 |             297.7 |             101.1 |        107.47 |            98.27 |            56.61 |
|       782 |   291397 |          428.3 |             299.1 |             101.3 |        109.65 |            90.78 |            60.31 |
|       842 |   314587 |          428.1 |             299.2 |             100.9 |        111.26 |            89.89 |            61.64 |
|       902 |   337987 |          428.6 |             298.8 |             100.8 |        108.38 |            87.43 |            56.94 |
|       962 |   361734 |          428.5 |             303.3 |             100.5 |        121.61 |            93.92 |            61.45 |
|      1022 |   385353 |          428.1 |             300.9 |             101.4 |        118.02 |            81.75 |            56.01 |
|      1082 |   406843 |          428.1 |             305.9 |             100.3 |        116.30 |            88.84 |            58.02 |
|      1142 |   430332 |          428.3 |             300.4 |             100.8 |        119.04 |            88.78 |            60.56 |
|      1202 |   453750 |          428.4 |             298.0 |             100.3 |        117.04 |            96.10 |            55.63 |
|      1262 |   476863 |          428.4 |             301.5 |             100.3 |        119.88 |            87.75 |            61.38 |
|      1322 |   499875 |          428.5 |             299.2 |             101.3 |        115.89 |            97.15 |            56.47 |
|      1382 |   523027 |          431.2 |             301.2 |             101.2 |        113.21 |            93.70 |            57.82 |
|      1442 |   546469 |          428.4 |             298.0 |             100.7 |        110.12 |            95.88 |            60.69 |
|      1501 |   569761 |          428.5 |             304.1 |             100.6 |        109.18 |            84.53 |            58.28 |
|      1561 |   591808 |          428.1 |             300.3 |             100.4 |        111.47 |            91.27 |            57.25 |
|      1621 |   614730 |          428.3 |             301.3 |             100.6 |        118.03 |            86.57 |            58.88 |
|      1681 |   637915 |          428.2 |             304.1 |             100.6 |        108.27 |            88.24 |            57.39 |
|      1741 |   661759 |          428.9 |             297.4 |             101.0 |        120.32 |            94.69 |            56.99 |
|      1801 |   685003 |          428.2 |             299.9 |             100.4 |          0.05 |             0.10 |             2.12 |
