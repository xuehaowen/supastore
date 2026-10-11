# Maintenance hardening backlog

Updated 2026-10-11. This records implementation separately from deployment
acceptance. Local verification uses synthetic databases, storage and mail;
production migration, provider receipts and human accessibility checks remain
external requirements.

| Step | Work                          | Implemented and verified locally                                                                                                                                                           | Remaining acceptance                                                                              |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1    | Backup and restore            | Fail-closed scripts, credential-safe output and integrity regressions                                                                                                                      | Isolated production-copy recovery drill                                                           |
| 2    | Housekeeping                  | Transactional bounded cleanup preserving durable history                                                                                                                                   | Deployment retention monitoring                                                                   |
| 3    | Worker                        | Independent schedules, structured failures and progress-based health                                                                                                                       | Hosting supervision and provider reconciliation                                                   |
| 4    | Runtime database role         | Restricted role, temporary-table reporting and PostgreSQL 18 regressions; CI matrix for 17/18 added                                                                                        | Run CI matrix and target-database migration rehearsal                                             |
| 5    | Pagination and selectors      | Admin/credit pages, stable CSV cursors, searchable variants/categories, bounded parent/attribute candidates; selected category values retained                                             | Large merchant catalog acceptance                                                                 |
| 6    | Bounded work and query plans  | XLSX caps, streamed sitemap pages, staged financial reports, capped snapshot CSV, pool/time budgets, measured order-list indexes                                                           | Deployment query plans, concurrent export/report load and online index rollout                    |
| 7    | HTTP and diagnostics          | Browser/provider deadlines, bounded JSON readers, public cache restrictions, API request IDs and structured payment reconciliation logs                                                    | Real ingress/network/provider acceptance                                                          |
| 8    | Sales and manual orders       | Canonical merchant-calendar metrics and atomic retry recovery                                                                                                                              | Merchant fiscal/report reconciliation                                                             |
| 9    | Contracts and ownership       | Shared quote validation, strict order/provider statuses, pure sitemap contracts, authorized read scopes, shared class utility and existing shared customer i18n owner                      | Human language/accessibility acceptance                                                           |
| 10   | Workflow and CI               | Queue context retention; lint, whole-repo format and coverage gates; isolated owned browser fixtures with guarded cleanup and suppressed live-provider credentials                         | Execute updated CI jobs                                                                           |
| 11   | Reproducibility and resources | Frozen lockfile, pinned pnpm/Node image and infrastructure digests, patched dependencies with zero production advisories, runtime heap budget, real-process RSS/bundle measurement command | Linux standalone/container memory budget and deployment-sized performance                         |
| 12   | Documentation                 | Maintenance guide reconciled; dated verification and acceptance instructions recorded                                                                                                      | Production receipts, restore, TLS/callback/origin, hosting cutover and human screen-reader checks |

No live providers were enabled and no merchant database was migrated. The
Windows Next CLI RSS measurement is not container acceptance: its backend peak
remained above 512 MiB. The runtime heap is capped at 256 MiB by default, but total
RSS includes native memory and code. Validate the deployed standalone process
under the real workload before claiming the lightweight memory target.

See [current evidence and acceptance steps](../docs/maintenance-hardening-evidence-2026-10-11.md).
