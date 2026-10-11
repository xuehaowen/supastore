# Maintenance hardening backlog

This tracks the broader audit requested after commit 611c1bb. Each group is
implemented and verified before progressing. Production credentials, human
screen-reader acceptance, and target-environment restore/cutover are recorded as
external verification, never claimed from synthetic tests.

| Step | Work                                                                              | Status                                                                         |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1    | Backup/restore fail-closed behavior, credential-safe output, cold-restore checks  | Implemented; command regressions pass. Real deployment drill remains external. |
| 2    | Transactional, bounded housekeeping preserving quote/purchase history             | Implemented; real PostgreSQL regression passes.                                |
| 3    | Independent worker schedules, exception details, progress-based health            | Implemented; unit/health regressions pass.                                     |
| 4    | Least-privilege runtime database role and supported-database tests                | Pending                                                                        |
| 5    | Pagination/history access, searchable selectors, stable export cursors            | Pending                                                                        |
| 6    | Bounded XLSX/reports/sitemap work, query plans/indexes/timeouts/pool budgets      | Pending                                                                        |
| 7    | HTTP deadlines/size bounds, public-read caching, request correlation              | Pending                                                                        |
| 8    | Canonical dashboard metrics and retry-safe manual orders                          | Pending                                                                        |
| 9    | Contract/type/input parity, private query boundaries, shared UI/i18n ownership    | Pending                                                                        |
| 10   | Preserve workflow context; CI lint/format/coverage and safer fixtures             | Pending                                                                        |
| 11   | Reproducible images/dependency gates, representative resource/bundle measurements | Pending                                                                        |
| 12   | Documentation reconciliation and actionable production/accessibility acceptance   | Pending                                                                        |

Use the existing Next.js/PostgreSQL stack and focused helpers. Preserve financial
transaction ownership, immutable history, authorization and outbound delivery
restrictions. Do not enable live providers or contact recipients as part of local
verification.
