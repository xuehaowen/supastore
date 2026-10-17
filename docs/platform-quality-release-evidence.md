# Platform quality release evidence

Date: October 17, 2026, America/Los_Angeles. Branch: `codex/platform-quality`.
Status: identified selling-path development changes pass local acceptance; not deployed or certified for real sales.

Final local acceptance: 1,171 unit/library tests, 143 PostgreSQL integration tests
and 49 production browser tests pass. Both production builds, types, lint,
formatting and all four frozen route budgets pass. Responsive/accessibility
acceptance covers 109 rendered screens at 375/768/1440px with no serious/critical
automated findings. [Detailed scope and limitations](selling-readiness.md).

## Evidence by workstream

| Workstream                                    | Evidence                                                                                                                   | Release limit                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Baseline                                      | [Reproduced failures and supported checks](platform-quality-baseline.md)                                                   | Local environment                                                               |
| HTTP contract safety                          | [Validated page contracts and rollout order](customer-page-contracts.md)                                                   | Real mixed-version deployment still needs acceptance                            |
| Discovery and route budgets                   | [Merchant metadata, indexing and enforced limits](storefront-discovery.md)                                                 | Real HTTPS domain and Search Console pending                                    |
| Usability, fixed design and sales reliability | [Findings, implementation and owner checklist](selling-readiness.md)                                                       | Actual catalog, photographs, providers and owner acceptance pending             |
| Recovery                                      | [Existing isolated launch evidence](launch-acceptance-2026-10-11.md), [recovery procedure](playbooks/disaster-recovery.md) | Fresh container rehearsal and matching production backup/assets restore pending |
| Performance                                   | [Retained measurements and unresolved tradeoffs](memory-diagnosis.md)                                                      | Deferred by owner; no resource thresholds changed                               |

## Release decisions

The owner prioritizes starting sales over further performance optimization.
Existing correctness and route-budget checks remain required. Failed purchases,
privacy/financial errors, unavailable recovery and resource exhaustion are not
waived by the performance deferral. The compact runtime remains optional.

The owner requested that the location stay private. No address, phone, opening
hours or LocalBusiness/Bakery markup is introduced. Theme configuration, external
merchant recruitment, generic onboarding and unrelated workflow refactors are
deferred or skipped for this release.

## Required evidence before cutover

- Owner approval of the real catalog, intended fulfillment/payment path and fixed
  storefront, including mobile and EN/ZH content.
- Controlled authorized order/payment, transactional email, fulfillment and refund
  in the designated environment. No synthetic entries in production ledgers.
- Real domain/TLS, origin/cookie/ingress behavior, worker supervision and basic
  KVM 2 resource headroom.
- Matching database/assets backup, isolated recovery with outbound sends disabled,
  reconciliation and compatible-image rollback/pause procedure.

No target host, provider account, real backup or production store was changed by
the isolated local acceptance work.
