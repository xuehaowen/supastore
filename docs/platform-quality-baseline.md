# Platform quality baseline

Date: 2026-10-16, America/Los_Angeles. Branch: `codex/platform-quality`.
Starting commit: `e342db7`. Step 1 local verification completed; corrections include `02c0e2b` and the browser-test changes recorded with this evidence.

## Reproduction and changes

The original restricted run reproduced four failures in three files. Running the same selection outside the filesystem/process sandbox passed the junction-replacement test and all six recovery-shell tests, leaving one stale fulfillment expectation. Neither filesystem checks nor shell failures were disabled or skipped.

`fulfillOrder` authorizes and locks the order before resolving delivery details from input or saved fulfillment information. The old unit assertion attempted this database-backed command without a database and expected an error before the transaction. The documented behavior intentionally preserves saved carrier/tracking values. The replacement PostgreSQL test verifies missing details reject completion without creating a shipment or changing lifecycle status, then verifies saved details survive completion in both fulfillment and shipment records. Production business logic is unchanged.

The full integration baseline exposed a second stale expectation: the fulfillment query defaults to active confirmed work, whereas the test expected unpaid orders with receipts. The revised test explicitly verifies the default excludes that work, the `all` view includes it for owners and excludes it for staff, and confirmed orders still paginate correctly. No application query or permission was relaxed.

The repository formatting gate also failed on three existing Markdown files. Formatting changes to business workflows, critical journeys and system capabilities normalize tables only; their business contracts are unchanged.

Both production apps built successfully. The first browser run passed 31 of 34 journeys and exposed three more outdated/racy assertions: two authentication tests inspected SMTP capture before the outbox worker delivered the message, and the report scale test expected an internal enum string even though the UI displays a readable label. The authentication tests now reuse the existing bounded `deliveredLink` polling helper (15 seconds for the five-second worker cadence); the report test verifies both the unique fixture reason and visible adjustment label while retaining its 10,000-row/pagination/export assertions. These are test corrections, not changes to notification timing or report semantics. The fresh measured rerun passed all 34 default production browser journeys and shut down its fixtures successfully.

## Environment and repeatable commands

- Windows, Node.js `v24.12.0`, repository-pinned pnpm `11.0.9`, Vitest `4.1.11`, Next.js `15.5.27`.
- The sandbox Corepack shim could not access the registry. The already installed pnpm entry point was available at `$env:LOCALAPPDATA/node/corepack/v1/pnpm/11.0.9/bin/pnpm.cjs`. Running that with Node executed the normal repository typecheck script without downloading or changing dependencies.
- Tests use an explicitly writable temporary directory under `.tmp-cuj/platform-quality`. Logs are ignored and contain synthetic fixtures only.
- Unit junction tests and shell recovery tests need normal Windows/Git Bash process permissions. A restricted-sandbox `EPERM` or shell startup error is an environment failure, not a passing security test.
- Production config loading initially failed with `ERR_SWC_NATIVE_CACHE`. The existing documented owner-only cache at `$env:USERPROFILE/.supastore-swc-native` is reused through `SWC_NATIVE_BINDING_CACHE`. No ACL, native-loader security check or dependency version was changed. See [Windows runtime notes](maintenance-hardening-evidence-2026-10-11.md).

Normal commands are the existing scripts:

```powershell
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run test:unit
pnpm run test:storefront:unit
pnpm run test:coverage
pnpm run test:errors
pnpm run test:integration
node scripts/test-storefront.mjs --measure
```

When using a restricted Windows environment, choose a writable temporary directory before starting these processes and run permission-dependent tests in a supported execution context. Set `SWC_NATIVE_BINDING_CACHE` to an existing validated private cache when required. Do not weaken native-cache permissions. The browser wrapper and storefront wrapper share the same production runner; one measured execution covers the default suite without rebuilding/running it twice.

## Current results

| Check                                     | Result                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Root/backend/storefront typecheck         | Passed                                                                                                                |
| Repository ESLint                         | Passed                                                                                                                |
| Repository Prettier                       | Passed after Markdown table formatting                                                                                |
| Full unit suite                           | 933 passed in 106 files                                                                                               |
| Storefront library suite                  | 64 passed in 10 files                                                                                                 |
| Domain coverage                           | Statements 94.40%, branches 92.48%, functions 100%, lines 94.32%; existing 90% thresholds passed                      |
| Failure-contract suite                    | 75 passed in 9 files; statements 92.50%, branches 92%, functions 94.73%, lines 93.50%; existing 80% thresholds passed |
| Full PostgreSQL integration               | 136 passed in 19 files, including the replacement delivery regression                                                 |
| Independent test-code review              | No actionable findings in the three modified test files; type/lint evidence supplied                                  |
| Both production builds                    | Passed                                                                                                                |
| Default production browser journeys       | 34 passed; initial three failures corrected and verified in a fresh run                                               |
| Process memory / initial route JavaScript | Recorded below; runner exited 0                                                                                       |

The PostgreSQL runner used only its dedicated `supastore_test` fixture plus owned per-suite databases. Browser testing uses a separate synthetic cluster, fixture asset storage and local SMTP capture; no real payments or external mail delivery are implied. Retained logs are under `.tmp-cuj/platform-quality` and are not committed.

## Remaining boundaries

These results are a local development baseline. They do not certify target host capacity, real-provider payment/email acceptance, a representative catalog/load envelope, disaster recovery on the target host or manual accessibility acceptance. Those remain separate plan steps. Historical evidence is not substituted for checks still pending in this run.

## Resource snapshot from the successful production run

Runtime: Windows Next CLI, Node 24.12.0. Both apps were freshly built. The workload was the seven default browser files named by `test-storefront.mjs`, including the 10,000-product/report scale fixture. This is a post-journey process sample and lifetime peak working set, not a sustained-load plateau or complete deployment footprint.

| Service    | Sample RSS bytes | Sample MiB | Peak RSS bytes | Peak MiB |
| ---------- | ---------------: | ---------: | -------------: | -------: |
| Backend    |      655,081,472 |      624.7 |    678,105,088 |    646.7 |
| Storefront |      402,993,152 |      384.3 |    409,407,488 |    390.4 |

Sampled application-process memory totals about 1,009 MiB, excluding PostgreSQL, asset/mail fixtures, browser, OS and other services. Measure Linux target host separately before sizing; this run does not establish a memory limit or improvement over differently measured historical runs.

| Initial route JavaScript | Chunks | Raw bytes | Sum of gzip chunk bytes |   KiB |
| ------------------------ | -----: | --------: | ----------------------: | ----: |
| Catalog/home             |     16 |   506,558 |                 159,838 | 156.1 |
| Product                  |     16 |   510,814 |                 161,262 | 157.5 |

The existing 200 KiB warnings were not triggered. This script still reports warnings only and covers two routes; enforcing budgets and adding cart/checkout remain step 4. It counts compiled initial chunks, not RSC/HTML, images, lazy chunks or real browser transfers. Steps 3/4 will establish comparable workload, latency and stability measurements. No production application optimization was made in step 1.
