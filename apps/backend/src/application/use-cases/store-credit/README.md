# Credit and rewards

Source lots, credit holds/capture/refunds, reward release/reversal and funding-review repair.

## When working here

Credit is funding rather than a discount. Keep accepted reward policy/source provenance and release only after complete fulfillment and settled funding.

## Where to start

- [credit-operations.ts](credit-operations.ts): Credit balances, reservations, capture and ledger operations.
- [credit-sources.ts](credit-sources.ts): Tracks source lots and credit funding provenance.
- [purchase-refund.ts](purchase-refund.ts): Coordinates purchase refunds across original funding sources.
- [resolve-reward-review.ts](resolve-reward-review.ts): Owner-reviewed repair of suspended reward funding.
- [reward-operations.ts](reward-operations.ts): Reward release, reversal and debt handling.

## Related paths and checks

- Storage: `store-credit.ts`, `credit-sources.ts` and immutable order reward/funding snapshots.
- Checks: unit `rewards.test.ts`, `reward-policy.test.ts`, `credit-refund-allocation.test.ts`; integration `reward-expansion.test.ts`.
- Merchant entry points: store credit, customer detail and commerce settings; customer account and checkout display funding. Refunds use original-source caps; owner funding-review resolution verifies original frozen receipt history rather than inventing replacement funding.

## More context

[Parent overview](../README.md) · [Financial contracts](../../../../../../docs/transaction-contracts.md)
