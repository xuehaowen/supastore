# Sales reporting

Fiscal sales totals, outside-sales adjustments, and threshold checks.

## When working here

Purchase refunds reduce eligible sales; excess-payment returns remain payout activity. This is not a general accounting ledger.

## Where to start

- [sales-report.ts](sales-report.ts): Fiscal sales reporting and threshold calculations/workflows.

## Related paths and checks

- Storage: `sales-reporting.ts` plus order/refund/audit source records.
- Checks: unit `sales-report.test.ts` and integration `sales-reporting.test.ts`.
- Merchant entry points: admin reports and export. Ambiguous historical tax revisions require review. Catalog export/import implementations live in the sibling catalog directory; general order import is unsupported.

## More context

[Parent overview](../README.md)
