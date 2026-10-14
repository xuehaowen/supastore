# Monorepo cleanup verification

Verified on 2026-10-14 UTC, using Windows host tooling and Docker Desktop's Linux
engine 29.7.2. Both application images use Node.js 22 and Next.js 15.5.27.

## Changes

- Removed unused prototype account, order, commerce and checkout components,
  their exclusive helpers, and obsolete prototype tests. The original customer
  pages and active payment HTTP client remain.
- Root `build` and `start` cover both apps. Individual service commands support
  development, build and production start, with matching public origin defaults.
- `test:all` runs each suite once and includes lint and formatting checks.
- Dependencies belong to the workspace that imports them. A source import check
  detects undeclared packages, including CSS imports.
- Container acceptance builds from the isolated fixture Compose file, captures
  startup diagnostics on failure and cleans up its fixture resources.
- Backend standalone execution uses Next's generated ES module `server.js`.

## Results

| Check                                                                                                 | Result                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Aggregate TypeScript, ESLint and Prettier                                                             | Passed                                                           |
| Unit and storefront helper tests                                                                      | 889 passed in 104 files                                          |
| Database integration tests                                                                            | 123 passed in 18 files                                           |
| Production browser journeys                                                                           | 34 passed                                                        |
| Linux backend, storefront and migration image builds                                                  | Passed                                                           |
| Container readiness, catalog, cart/order cookies, retry idempotency, ownership, CSRF and admin assets | Passed                                                           |
| Restore baseline migration 28 and upgrade to 38 applied migrations                                    | Catalog, variants, store settings and payment accounts preserved |
| Database recovery and temporary outage                                                                | Orders, items and guest proofs restored; readiness recovered     |
| Fixture cleanup                                                                                       | No acceptance containers remained                                |

The read-only Linux load check used a small fixture store, five routes, eight
concurrent workers and 120 seconds. All 15,908 requests succeeded. Per-route p95
latency ranged from 58 ms to 199 ms.

Uncompressed local image sizes were 80,704,757 bytes for the backend,
78,178,453 bytes for the storefront and 60,945,540 bytes for migrations.

## Reproduce

```bash
pnpm install --frozen-lockfile
pnpm test:all
pnpm test:containers
```

Container acceptance uses the `supastore-codex-smoke` project and synthetic
credentials. The main local database, application `.env` and developer Docker
volumes are outside this fixture. Production start commands accept explicit
public origin values from the shell environment.
