# Business calculations and lock ordering

Checkout, money, rewards, reporting, destination, shipment and financial-projection calculations. Most files are pure calculations; `locking/lock-order.ts` is an exception that executes database lock queries.

## When working here

Use explicit inputs. Do not add hidden database, network or clock dependencies to pure calculations. Domain coverage thresholds apply here.

## Where to start

- [checkout.ts](checkout.ts): Checkout validation and fulfillment inputs.
- [commerce-policy.ts](commerce-policy.ts): Shared commerce policy rules.
- [rewards.ts](rewards.ts): Reward eligibility and calculations.
- [sales-report.ts](sales-report.ts): Sales and fiscal-period calculations.

- [Catalog calculations](catalog/README.md): Variant combinations, CSV interpretation and historical item names.
- [Financial projections](financial-projection/README.md): Canonical balances and payout-discrepancy calculations.
- [Shared lock ordering](locking/README.md): Sorted, deduplicated transactional lock acquisition for financial resources.
- [Money calculations](money/README.md): Integer minor-unit calculations and human-readable payment references.
- [Payment normalization](payments/README.md): Normalization rules for payment identity/reference inputs.
- [Credit refund allocation](store-credit/README.md): Pure allocation of purchase refunds across credit funding.

## More context

[Parent overview](../README.md)
