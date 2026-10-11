# Maintenance hardening backlog

Updated 2026-10-11. This records implementation separately from deployment
acceptance. Local verification uses synthetic databases, storage and mail;
production migration, provider receipts and human accessibility checks remain
external requirements.

| Step | Work                          | Implementation and isolated verification                                                                                                                                                   | Remaining acceptance                                                                              |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1    | Backup and restore            | Fail-closed scripts, credential-safe output and integrity regressions                                                                                                                      | Isolated production-copy recovery drill                                                           |
| 2    | Housekeeping                  | Transactional bounded cleanup preserving durable history                                                                                                                                   | Deployment retention monitoring                                                                   |
| 3    | Worker                        | Independent schedules, structured failures and progress-based health                                                                                                                       | Hosting supervision and provider reconciliation                                                   |
| 4    | Runtime database role         | Restricted role, temporary-table reporting and PostgreSQL 17/18 CI regressions passed                                                                                                      | Target-database migration rehearsal                                                               |
| 5    | Pagination and selectors      | Admin/credit pages, stable CSV cursors, searchable selectors retaining selected values; concurrent 10,000-product paging/CSV regression                                                    | Large merchant catalog acceptance                                                                 |
| 6    | Bounded work and query plans  | XLSX caps, streamed sitemap pages, staged financial reports, capped CSV, pool/time budgets, measured indexes; concurrent 10,000-adjustment report/export regression                        | Deployment query plans, concurrent export/report load and online index rollout                    |
| 7    | HTTP and diagnostics          | Browser/provider deadlines, bounded JSON readers, public cache restrictions, API request IDs and structured payment reconciliation logs                                                    | Real ingress/network/provider acceptance                                                          |
| 8    | Sales and manual orders       | Canonical merchant-calendar metrics and atomic retry recovery                                                                                                                              | Merchant fiscal/report reconciliation                                                             |
| 9    | Contracts and ownership       | Shared quote validation, strict order/provider statuses, pure sitemap contracts, authorized read scopes, shared class utility and existing shared customer i18n owner                      | Human language/accessibility acceptance                                                           |
| 10   | Workflow and CI               | Queue context retention; lint, whole-repo format and coverage gates; isolated owned browser fixtures with guarded cleanup and suppressed live-provider credentials                         | Hosting-specific workflow acceptance                                                              |
| 11   | Reproducibility and resources | Frozen lockfile, pinned pnpm/Node image and infrastructure digests, patched dependencies with zero production advisories, runtime heap budget, real-process RSS/bundle measurement command | Deployment-sized performance and memory acceptance                                                |
| 12   | Documentation                 | Maintenance guide reconciled; dated verification and acceptance instructions recorded                                                                                                      | Production receipts, restore, TLS/callback/origin, hosting cutover and human screen-reader checks |

No live providers were enabled and no merchant database was migrated. Linux CI
has passed PostgreSQL 17/18 and container smoke, upgrade, recovery and synthetic
read-load acceptance. Its standalone browser fixture measured backend RSS
261.5 MiB (294.0 MiB peak) and storefront RSS 177.1 MiB (177.2 MiB peak), with
all 11 cross-service journeys passing. This resolves the earlier Windows CLI
measurement limitation for this fixture; deployed merchant-sized workloads
still need their own evidence. The runtime heap is capped at 256 MiB by default,
while total RSS includes native memory and code.

See [current evidence and acceptance steps](../docs/maintenance-hardening-evidence-2026-10-11.md).
