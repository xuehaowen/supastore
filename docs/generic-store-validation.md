# Generic store implementation and validation

Updated 2026-10-06. This records local implementation evidence, not production launch approval.

## Delivered capabilities

- Verified customer registration/login, profile and addresses, password change/reset, order ownership and recovery. English and Chinese storefront flows call backend APIs.
- Merchant-configurable guest checkout, reward activation/rate, fulfillment methods, sales threshold and fiscal-year start. Rewards default off; 500 basis points means 5%. Eligible discounted merchandise earns only on settled external funding, with release on completed fulfillment. Tax, fees and credit-funded value do not earn.
- Immutable reward snapshots, source lots, reservation provenance, cumulative refund reversals and debt recovery. Funding corrections requiring review suspend reward release. Historical credit is retained as legacy credit without invented past rewards.
- Variant stock reservations, optional pickup/delivery scheduling, total slot capacity and variant quotas. Owners can configure windows before booking. Shipping dispatch and recorded delivery are distinct; pickup completion requires verified handoff.
- Stripe card checkout, verified durable webhook processing, recovery, terminal provider expiry and original-source refunds. Manual payments retain review-based reservation expiry.
- Staff sales reports/CSV, outside-sales adjustments and deduplicated threshold alerts. Sales refunds cap at purchase value; overpayment returns remain payout activity. Ambiguous historical tax revisions require review.
- Two application images, a separate migration job, same-origin API/admin proxying, private backend secrets, public SEO and optional consent-based analytics.
- Reward category eligibility and inclusive-start/exclusive-end UTC activation windows. Audited, idempotent funding-review resolution verifies every original frozen receipt before reinstating credit; it never invents replacement funding.
- Atomic staff slot rescheduling, quantity-based partial shipments, signed/timestamp-bounded carrier callbacks and per-shipment customer tracking. Stock is consumed per dispatched unit; rewards release only after all units are delivered.
- Dependency-free shared serializable account/store/catalog/cart contracts, catalog assembly optimization, and owner-fenced worker acknowledgement after lease recovery.

## Local evidence

| Check | Result |
| --- | --- |
| Backend and storefront TypeScript | Passed |
| Unit, synthetic lifecycle and storefront library tests | 71 files / 619 tests passed after notification refactor |
| Clean PostgreSQL integration | 11 files / 83 tests passed, including migrations through 0034 |
| Production browser journeys, including profile and emailed reset | 54 passed from rebuilt follow-up source |
| Two-service production browser journeys | Both services rebuilt from follow-up source; 2 passed |
| Domain coverage | 96.1% statements/lines, 91.47% branches |
| Container builds and isolated service smoke | Built and passed; 30-minute load: 685,003 requests / zero failures |
| Final code review | No remaining critical/high findings |

Run `pnpm test:all` for both applications' type, unit, integration and browser checks, or run the individual scripts. `pnpm test:containers` runs the disposable container acceptance gate; `pnpm bench:storefront` measures the current production bundle and `pnpm check:services` reports service configuration without connecting. Integration and browser runners use isolated synthetic databases. The integration runner listens on 127.0.0.1:25438. See [two-service deployment](two-service-deployment.md) for settings, container builds and migration execution.

## Release limits and remaining acceptance

The supported boundary is one physical-goods store, one currency and one stock pool per variant. Scheduling applies to pickup/local delivery. Digital goods, subscriptions, marketplaces and multiple warehouses remain future work.

Taxable or reward-bearing repricing requires replacement checkout. Funding-review resolution requires an owner decision and repaired original source history; uncertain source reassignment stays suspended. Reward details remain in the ledger and audit records; customer reward-detail emails are disabled. Provider-neutral SMS/verification ports now have Telnyx adapters, durable callbacks and consent fencing; live sending remains disabled. See [notification integrations](notification-integrations.md) for configuration and validation. No live SMS provider credentials were used.

Before launch, validate real Stripe and SMTP delivery configuration, rehearse migrations against a restored production copy, and execute production deployment/domain cutover. Stripe credentials are absent locally. The read-only SMTP authentication/connection probe failed; no email was sent. Run `node scripts/check-release-services.mjs --connect` after fixing configuration. Synthetic dump/restore and backend outage recovery have passed; production data and hosting access are still required for a production rehearsal/cutover.

The user relaxed the original 50 KB public JavaScript goal. The measured shared first-load baseline is 102 KB; use 200 KB as a regression warning rather than a launch restriction. The migration image was reduced from 1.54 GB to about 241 MB by bundling only the migration runner and SQL. Final sustained-load and image results are recorded in [release evidence](generic-store-release-evidence.md).

The API proxy reuses connections, clears deadline resources on stream completion,
and accepts client IPs only through an optional authenticated edge contract. See
[merchant operations](merchant-generic-store-operations.md) for ingress setup.

Stripe currency units are validated before checkout/refund network calls and
settlement. Incompatible or unverified currencies use manual payments; amounts
are never silently converted or rounded. Provider receiving accounts are excluded
from manual payment selection.
