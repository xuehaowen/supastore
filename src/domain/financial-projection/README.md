# Financial projections

Canonical balances and payout-discrepancy calculations.

## When working here

Keep purchase funding, customer settlement, actual outgoing money and payout-error loss separate. Do not create an independently editable balance.

## Where to start

- [discrepancies.ts](discrepancies.ts): Separates customer settlement from payout errors.
- [projection.ts](projection.ts): Canonical receipt, funding and payout balance calculations.

## More context

[Parent overview](../README.md) · [Financial contracts](../../../docs/transaction-contracts.md)
