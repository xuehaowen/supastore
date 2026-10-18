# Platform quality release evidence

Date: October 17, 2026, America/Los_Angeles. Branch: `codex/platform-quality`.
Status: identified selling-path development changes pass local acceptance; not deployed or certified for real sales.

Local acceptance: 1,182 unit/library tests pass; the earlier 143 PostgreSQL
integration results are retained. The current default CI command passes 45
production browser tests; the earlier extended run passed 49, including six
legacy M1 tests outside the default selection. Both production builds, types, lint,
formatting and all four frozen route budgets pass. Responsive/accessibility
acceptance covers 109 rendered screens at 375/768/1440px with no serious/critical
automated findings. [Detailed scope and limitations](selling-readiness.md).

Fresh Linux container smoke, restored migration upgrade, synthetic database
restore and measured backend-outage recovery pass. The corrected recovery
poller confirms healthy readiness in 984.386 ms after the Docker start command
returns, within its enforced 30-second polling deadline. See [current recovery
evidence](reliability-acceptance-2026-10-17.md) for source/image identifiers and
the separate production shell/asset-backup limitations.

Optional deployment profiles: separate pickup-only and shipping-only instances,
manual payment on both. [Configuration and profile acceptance](independent-store-instances.md)
cover isolated names/ports/data, the relevant mobile checkout fields, manual
receipt confirmation and fulfillment. Card credentials/provider acceptance are
not required for these manual-payment profiles; verified transactional email and
actual manual-payment reconciliation remain required.

Each store can now select its backend/storefront/migration release images
independently. Compose rendering verifies candidate/previous pickup references
without changing shipping references or data volumes. This is configuration
acceptance only; no target-host upgrade/rollback or image provenance is certified.

## Evidence by workstream

| Workstream                                    | Evidence                                                                                                                       | Release limit                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Baseline                                      | [Reproduced failures and supported checks](platform-quality-baseline.md)                                                       | Local environment                                                     |
| HTTP contract safety                          | [Validated page contracts and rollout order](customer-page-contracts.md)                                                       | Real mixed-version deployment still needs acceptance                  |
| Discovery and route budgets                   | [Merchant metadata, indexing and enforced limits](storefront-discovery.md)                                                     | Real HTTPS domain and Search Console pending                          |
| Usability, fixed design and sales reliability | [Findings, implementation and owner checklist](selling-readiness.md)                                                           | Actual catalog, photographs, providers and owner acceptance pending   |
| Recovery                                      | [Fresh local container acceptance](reliability-acceptance-2026-10-17.md), [recovery procedure](playbooks/disaster-recovery.md) | Matching production backup/assets restore and shell procedure pending |
| Performance                                   | [Retained measurements and unresolved tradeoffs](memory-diagnosis.md)                                                          | Deferred by owner; no resource thresholds changed                     |

## Release decisions

The owner prioritizes starting sales over further performance optimization.
Existing correctness and route-budget checks remain required. Failed purchases,
privacy/financial errors, unavailable recovery and resource exhaustion are not
waived by the performance deferral. The compact runtime remains optional.

Public business details require merchant approval. No address, phone, opening
hours or LocalBusiness markup is introduced. Theme configuration, external
merchant recruitment, generic onboarding and unrelated workflow refactors are
deferred or skipped for this release.

## Required evidence before cutover

The latest [actual shell recovery rehearsal](reliability-acceptance-2026-10-17.md#actual-shell-procedure-follow-up)
passes custom/plain PostgreSQL restores plus overwrite, active-session and
corruption guards after the Alpine checksum compatibility fix. All 1,183
unit/library tests pass. Local OAuth2 SMTP authentication also passes without
sending mail. These checks leave the real recipient, merchant backup/assets and
target-host acceptance below open.

- Owner approval of the real catalog, intended fulfillment/payment path and fixed
  storefront, including mobile and EN/ZH content.
- Controlled authorized order/payment, transactional email, fulfillment and refund
  in the designated environment. No synthetic entries in production ledgers.
- Real domain/TLS, origin/cookie/ingress behavior, worker supervision and basic
  target host resource headroom.
- Matching database/assets backup, isolated recovery with outbound sends disabled,
  reconciliation and compatible-image rollback/pause procedure.

No target host, provider account, real backup or production store was changed by
the isolated local acceptance work.

The later contextual commerce module adds migration 0040 and has separate
[implementation and acceptance evidence](commerce-evaluation.md#local-acceptance-2026-10-17).
Earlier migration/test counts in this document describe their recorded revisions.
