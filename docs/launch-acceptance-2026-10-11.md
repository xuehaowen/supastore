# Launch acceptance — 2026-10-11

This record separates automated fixture verification from checks requiring the
merchant's deployment environment. Docker testing uses the separate
`supastore-codex-smoke` project, synthetic credentials/data and disabled outbound
workers. Existing `my-dev` containers are not test targets.

## Completed automated checks

- Current-head Linux CI: all six jobs passed, including PostgreSQL 17/18,
  container acceptance, 123 integration tests and 91 browser journeys.
- Real-service scale fixtures: 10,000 catalog products and 10,000 reporting
  adjustments, bounded first/last pages and concurrent reports/CSV exports.
- Local Docker image build, non-root runtime identity, 256 MiB Node heap settings
  and no configured fixture payment/email credentials.
- Local checkout, ownership, CSRF, private cookies, idempotent order retry,
  public readiness and admin asset checks.
- Synthetic baseline backup/restore, upgrade to 38 applied migrations, migration
  retry, order/private-proof restoration and database-outage recovery.
- Read-only provider configuration probe: Stripe and SMS absent; SMTP OAuth2
  configuration incomplete. Authentication/delivery cannot be verified yet.
- Deployment recipe updated for separate backend/storefront and migration job.
  Outbox recovery requires record-specific provider evidence and retains
  uncertain in-flight states instead of bulk marking old records delivered.

## Sustained local verification

Images built from application revision `2d0171383af7ff921159dc76442f64b14c5b8868`
passed a 1,800-second soak with ten concurrent read workers: 510,626 requests and
zero failures, without retries. Route p95 latency ranged from 33 to 81 ms.
Two independent writer loops each passed 50 existing checkout smoke journeys
with a 30-second pause between journeys, finishing before the read soak ended.
The database contained 101 orders: the initial fixture order plus 100 writer
orders; idempotent order retries did not create duplicates. All three processes
exited zero, and only the fixture containers/network were removed. Existing
`my-dev` containers remained running.

Minute-spaced Docker container-memory samples ranged from 174 to 177.8 MiB for
backend, 118.4 to 129.1 MiB for storefront and 102.3 to 110.9 MiB for PostgreSQL.
These are sampled container usage, not process RSS, startup peaks or total host
memory. The fixture uses the default 256 MiB Node heap per application, with no
fixture CPU/container-memory limit. The Docker Desktop engine exposes roughly
15.2 GiB of memory; target-host CPU and memory limits require separate acceptance.

The overlap is a synthetic mixed read/checkout workload, not a measured
arrival-rate model. The fixture has one published product, not production-scale
stock, reporting or worker activity. Large report/catalog acceptance runs
separately. The full local log is retained in the ignored
`.tmp-cuj/launch-soak.log`; representative production data and worker/report
traffic still require target-environment verification.

Built local image identifiers (not published registry digests):

- Backend: `sha256:b5defd31b5cc19da755535f9a52b91814bd16450742576efa2e6d1843cf5ff1e`.
- Storefront: `sha256:adda8c62daef3680800132a772000cc881036197f4d86b99ff50ab567b420c9f`.
- Migrations: `sha256:17dab75d0d7464bc424340232dc77195019abca3e17a3e11a5da86a2460525c5`.

Reproduce by running `scripts/test-container-acceptance.mjs` with synthetic build
variables from the CI container job and `LOAD_DURATION_SECONDS=1800`,
`LOAD_CONCURRENCY=10`, `LOAD_CONTAINER_METRICS=true`. Once smoke, upgrade and
recovery pass and the read load begins, run two independent loops of
`node scripts/test-container-smoke.mjs`, 50 iterations each, checking each exit
code and pausing 30 seconds between iterations. Keep provider credentials absent
and fixture worker disabled. Never direct these writers at a merchant database.

## Remaining launch inputs and acceptance

| Check                                                 | Why it remains                                                               | Who can perform verification                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| HTTPS, DNS, ingress/client-IP contract, callbacks     | Production hostname and hosting configuration unavailable                    | Agent with target access                                   |
| Real provider authentication and receipts             | Usable provider credentials and approved recipient/test account unavailable  | Agent with test configuration and authorization            |
| Production-copy recovery including object storage     | Actual matching database/assets backup unavailable                           | Agent with isolated backup access                          |
| Scheduled backups, alert delivery, worker supervision | Actual deployment scheduler and alert destination unavailable                | Agent with target configuration                            |
| Target-host representative load                       | Hardware/data and production worker configuration unavailable                | Agent on an isolated deployment copy                       |
| Store configuration                                   | Merchant must choose products, stock, delivery, taxes and supported payments | Merchant decisions; agent can validate configured behavior |
| Screen reader, language and fulfillment usability     | Automated checks cannot establish human usability/translation acceptance     | Human acceptance                                           |
| Merge and production cutover                          | Draft PR remains open; no deployment target is supplied                      | Release approval, then agent can execute                   |

The existing isolated checks establish code/service behavior. They do not
certify real payment settlement, notification delivery, production backup
completeness or launch-host capacity. Manual payments may be a deliberate launch
choice, but required notification/account-verification flows must still be
configured and tested. Do not treat missing optional providers as a requirement
to enable every integration.
