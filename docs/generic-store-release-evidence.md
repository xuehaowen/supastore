# Follow-up release evidence

Date: 2026-10-06, America/Los_Angeles.

The follow-up completes category/date rewards, audited funding review, atomic rescheduling, partial shipments/carrier events, shared contracts and local acceptance tooling. Production rollout remains dependent on the merchant's target environment and credentials.

## Repeatable local gates

- `node scripts/test-container-acceptance.mjs`: builds application/migration images, creates an isolated synthetic Compose project, migrates/seeds, tests HTTP ownership/checkout, rehearses dump/restore/upgrade and outage recovery, runs bounded load, then removes only the fixture project.
- `LOAD_DURATION_SECONDS=1800`, `LOAD_CONCURRENCY=8` and `LOAD_CONTAINER_METRICS=true` enable a 30-minute measured run. In PowerShell, set these environment variables before starting the runner.
- `node scripts/check-release-services.mjs` reports configuration presence without revealing secrets. `--connect` performs Stripe account authentication and SMTP verification only; it creates no payment or email.

## Verified results

- Both TypeScript checks passed.
- Unit/lifecycle/storefront libraries: 588 tests in 65 files passed.
- Clean PostgreSQL integration: 67 tests in 9 files passed. Migrations 0030–0032 applied.
- Production browser journeys: 54 passed; separate backend/storefront production journeys: 2 passed. Both runners rebuilt from follow-up source and shut down cleanly.
- Independent final code review found no critical/high blocker.
- Synthetic baseline dump/restore retained order, item and private-proof data; upgrade and migration retry passed. Backend outage was detected through public readiness and recovered within 30 seconds.
- Migration image dropped from about 1.54 GB to 241 MB. Serving images measured 341 MB backend and 323 MB storefront.
- Sustained gate: 1,800 seconds, eight workers, 685,003 read-only requests and zero failures, with no retries. Route p95 latency: 18–52 ms; warm sampled memory: backend 427–431 MiB, storefront 297–306 MiB, PostgreSQL 100–101 MiB. See [retained samples and methodology](local-performance-recovery.md).

## External gates

Stripe test/live credentials and SMS credentials are absent locally. SMTP settings exist; a read-only probe outside the network sandbox reached the service but returned `EAUTH` (authentication rejected). No live notification was sent. Real delivery/payment acceptance requires corrected credentials and a designated test recipient/store environment. Production restoration, deployment and DNS cutover require target hosting/domain access.

Manual screen-reader acceptance remains a human release check; automated browser journeys do not certify it.

Automatic approval review rejected wiring phone numbers/order-status text to Twilio without specific authorization. SMS sending remains hard-disabled; the pending authorization asks explicitly about that payload/destination. Reward financial emails also remain disabled following the earlier rejection.

## Bundle measurement

`node scripts/measure-storefront-bundle.mjs` sums per-chunk gzip sizes from the
production app manifest, including layouts/error chunks. Catalog: 107,482 bytes
(105.0 KiB); product: 111,178 bytes (108.6 KiB). Both are below the relaxed 200 KiB
regression warning. This measures initial compiled JavaScript, not RSC payloads,
browser cache behavior or lazy chunks. Next's shared first-load estimate is 102 KB.

## Sustained-load transport correction

The first extended run failed with client `EADDRINUSE`: the Next rewrite proxy
returned `Connection: close`, opening one socket per API request until Windows
ephemeral ports were exhausted. That failed run is diagnostic evidence, not a
passing performance result. A fixed-origin streaming API proxy now strips
hop-by-hop headers and reuses connections while preserving exact webhook bytes,
multiple cookies and mutation origins. Proxy regressions and rebuilt
browser/container acceptance passed. The fresh 30-minute run passed without
socket failures or continuing memory growth.

The first persistent-proxy diagnostic exposed retention from per-request
30-second timeout signals. Explicit abort-controller deadlines now clear their
timers/client listeners when streamed responses finish, error or cancel. At
two minutes, the storefront used about 248 MiB versus roughly 1.42 GiB before
cleanup, with 43,851 requests and no failures. This is a diagnostic comparison;
the full sustained run established a stable 297–306 MiB warm plateau.

Untrusted client-IP headers are stripped. An optional `EDGE_PROXY_SECRET`
authenticates a trusted ingress supplying one validated client IP; secret/custom
IP headers are removed before forwarding. Until the production edge contract is
configured, backend auth rate limiting may use a shared per-route bucket. See
[ingress configuration](merchant-generic-store-operations.md). This optional
addition received separate unit/type/security review and a final image boundary
check; the retained 30-minute run used the default configuration without an edge
secret and preceded this final header-contract addition.

Measured environment: Windows host with AMD Ryzen 7 9700X (16 logical processors),
Docker Desktop Linux/x86_64 engine exposing 16 CPUs and about 15.2 GiB memory.
Repository HEAD was `83eb57c` plus the uncommitted generic-store implementation.
The fixture contains one product; these results establish the local service
boundary and stability, not production catalog capacity.

## Final payment-safety boundary

Merchant precision is checked against verified Stripe charge units before intent
creation/reuse, refunds and webhook settlement. Invalid settlement units enter
durable review; no conversion or rounding rewrites an accepted order. USD/CNY
precision 2 and JPY precision 0 are supported; ISK/UGX require precision 2 and
whole-unit amounts. Unknown/unverified currency codes fail closed for cards and
retain manual payment support. See [Stripe's currency documentation](https://docs.stripe.com/currencies)
and the supported set in `src/domain/stripe-currency.ts`. Provider account
availability/minimum amounts remain part of live acceptance. Provider receiving
accounts are also excluded from manual payment choices. Independent review and
ten PostgreSQL Stripe lifecycle cases passed, including pre-network rejection
and durable review of incompatible units.
