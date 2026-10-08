# Lightweight commerce implementation and release evidence

## Implementation scope

The implementation adds catalog tables and drafts, collections, reusable attributes, explicit option mapping and deterministic SKU generation, specifications, managed images, verified customer ownership and address books, tracked inventory, store credit, mixed-source refunds, physical returns, localized catalog filtering, store information, and normalized CSV import/export.

Existing manual payment and fulfillment workflows remain the launch payment path. Hosted card payments are the optional next phase. No new application runtime dependencies, Redis, or separate commerce service were introduced.

## Verified evidence

Evidence comes from disposable fixtures, not the configured store database.

| Check                              | Result                                                                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and synthetic lifecycle suite | 47 files, 478 tests passed                                                                                                                                                             |
| PostgreSQL integration suite       | 6 files, 39 tests passed; fresh migrations, concurrent reservations, identity, refunds, imports, bulk variants, immutable ledgers, and exact-microsecond cursor paging                 |
| Full production browser suite      | 53 tests passed against a freshly built production app using disposable PostgreSQL, S3, and SMTP fixtures                                                                              |
| Full commerce browser journey      | Passed: create draft, upload image, publish, open stock, issue credit, mixed checkout, confirm bank payment, fulfill, return, restock, split refund, settle external payout, reconcile |
| Production build                   | Passed without a running database; catalog pages generate on demand                                                                                                                    |
| First-load JavaScript              | Shared 102 kB; catalog/search 117 kB; product 128 kB; checkout 123 kB; account/order 128 kB; admin up to 132 kB                                                                        |

Build sizes are Next.js output, not measured network transfer or performance guarantees. The complete browser regression suite passes in production mode. Run `node scripts/test-browser.mjs --production` to rebuild and verify an isolated synthetic store.

## Remaining acceptance work

The full plan is not certified complete. Bulk variant changes, product unsaved indicators, text and category retention after validation errors, and category pagination are implemented. Public images use the existing Next.js responsive optimizer through a publication-checked, bounded image response. Credit and stock history use timestamp/ID cursors instead of shifting offsets. Remaining work includes broader form input-retention polish, protected admin thumbnails, keyboard/screen-reader checks, and representative scale and recovery evidence. External-payment refunds converted to credit with explicit customer agreement are not yet supported; refunds currently restore each original funding source.

The reference dataset of 10,000 products, 50,000 variants, and 100,000 orders and the 30-minute standalone memory/load measurements have not been run. Container size, RSS, latency, and thumbnail budgets remain targets. The synthetic memory benchmark is not evidence of production app RSS.

## Safe release procedure

1. Take and restore a database and asset backup with outbound delivery disabled. Record the restore result before upgrading the real store.
2. Review migrations 0008–0021 against a restored copy. The implementation test runners apply them only to disposable databases; no real store migration has been applied by this task.
3. Run the complete unit, integration, browser, typecheck, and production-build checks against the intended release revision.
4. Inspect the legacy option mapping report. Map existing variants explicitly; preserve their IDs, SKUs, prices, and historical order snapshots. Resolve import errors before publishing affected products.
5. Enter opening stock counts deliberately. Tracking activation rejects outstanding untracked orders; resolve those orders first. Confirm zero reconciliation drift.
6. Verify account email delivery and guest-order claim proofs before issuing redeemable credit. Review funding and partial-refund behavior with synthetic customers.
7. Test managed uploads, failed-upload cleanup, published asset access, policy content, and both supported locales with the deployment's storage and SMTP configuration.
8. Enable sales after pending acceptance and production measurements pass. Keep refunds, return processing, and reconciliation available if new sales are paused.

After stock or credit activity, do not roll back to code that ignores reservations or ledger obligations. Use a compatible forward fix, or a reconciled restore that accounts for actual payments and physical stock movements. Ledger mutations are append-only; repairs use audited compensating entries.

### Follow-up verification

The three catalog-polish production browser tests pass, including category restoration and persistence after correcting an invalid save. Receipt correction now locks order before receipt, reads prior corrections and dispositions across every order receipt, and separates purchase refunds from payment returns. The integration regression verifies the waiting correction holds no receipt lock.
