# Current Docker launch rehearsal

Date: October 18, 2026, America/Los_Angeles. Application source:
`ee9777ecdf27da51679183f7cdca1eee2c57fe95`. The complete command
`node scripts/test-container-acceptance.mjs` passed with exit code 0, including
fresh backend, storefront and migration image builds. Docker Engine: 29.7.2;
container Node.js: v22.23.3. All three images run as `nextjs`.

## Results

- The isolated `supastore-codex-smoke` Compose project passed service health,
  catalog, API connection reuse, cart cookies, shipping quote, manual-payment
  order creation, duplicate-order retry, private order access, ownership denial,
  foreign-origin denial and proxied admin asset checks.
- A restored synthetic baseline at migration index 28 upgraded successfully to
  **42 applied migrations**, through `0041_promotion_limits`. Catalog, variant,
  store and payment-account identities and values matched their pre-upgrade
  fingerprints.
- A separate database dump/restore preserved exact fingerprints for orders,
  order items and guest-order sessions. Reapplying migrations succeeded.
- Stopping the backend made public readiness return **502**. Readiness recovered
  in **975.3962 ms**, in one poll attempt, after Docker's start command returned.
  The existing enforced deadline is 30 seconds; this is not total outage time.
- The existing 120-second, eight-worker read smoke completed **30,884 requests
  with zero failures**. This one-product fixture establishes local reliability,
  not representative capacity or target-host sizing. Performance optimization
  remains deferred.
- The runner removed its fixture containers and network. Independent Docker
  inventories confirmed no project containers, networks or labeled volumes
  remained.

[Machine-readable results and image IDs](benchmarks/2026-10-18-container-launch.json).
Detailed synthetic output remains locally in
`.tmp-cuj/platform-quality/launch-containers-2026-10-18.log`.

## Scope and remaining acceptance

The fixture publishes only loopback port 3097, uses synthetic credentials/data and
disables the worker. It uses no merchant database or external provider credentials
and sends no real notifications or payments. The container runner's database
dump/restore path does not exercise the production shell backup procedure, object
storage restoration or a merchant's financial ledger.

The separate [giveaway acceptance record](benchmarks/2026-10-18-giveaway-launch.json)
retains the latest 1,211 unit/library, 163 integration and 52 browser results,
including bounded promotions and zero-payment checkout. Those suites were not
rerun for this documentation-only follow-up. The container smoke is complementary
and does not claim full owner fulfillment/refund or contextual-rule browser
coverage inside Docker.

Before selling, approve actual catalog/prices, fulfillment instructions, promotion
and reward settings; verify the intended manual-payment sales path, transactional
email receipt, fulfillment and refund; and rehearse a matching database/assets
backup in isolation with outbound delivery disabled. Public deployment additionally
requires actual HTTPS/origin/cookie, worker supervision and ingress checks. The
earlier [shell recovery evidence](reliability-acceptance-2026-10-17.md) remains a
separate synthetic check. No production deployment or merchant acceptance is
claimed here.
