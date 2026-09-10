# Accounting and transaction contracts

This document owns financial calculations, locking and repeat-request semantics. It is a design contract to implement and test, not executable code. All amounts are nonnegative integer currency minor units unless explicitly identified as signed deltas.

## Purchase calculation

Use one pure calculation function for quotes and eligible price changes. Define P as the accepted purchase total: merchandise plus shipping plus exclusive tax, including signed component adjustments. Inclusive tax is already within prices and is not added twice. P and every adjusted component must remain nonnegative.

For initial supported configurations, calculate tax per adjusted line total and shipping component using exact decimal/rational arithmetic, round each tax component half-up to the currency minor unit, and sum. Inclusive tax extraction uses the same component rounding. Display the policy in setup. Free-shipping thresholds use adjusted merchandise subtotal before separately added exclusive tax. Do not use binary floating-point arithmetic for money. Quantities must be positive safe integers with an enforced upper bound. Reject overflow at API and persistence boundaries.

Snapshot the currency/precision, rates, rounding policy, inputs, components and result. Refund component allocations cannot exceed purchased component amounts after earlier authorizations. There is no credit or promotion term in core.

## Canonical financial projection

One domain projection computes balances from receipts, applied corrections, confirmation funding, effective authorizations and reconciled transfers. All screens and commands use that projection. SQL read optimizations must be verified against it; do not introduce independently editable balance fields.

For receipt i:

- R_i = original amount + applied signed corrections; R_i >= 0.
- A_i = effective authorized disposition amount across purchase refunds and excess/cancellation/late returns. It includes its settled portion exactly once.
- S_i = reconciled amount physically paid out against those authorizations.
- U_i = A_i - S_i, the still-authorized unsent remainder; U_i >= 0.
- Available new payout capacity = max(0, R_i - A_i).

Ordinary operations preserve S_i <= A_i <= R_i. Corrections may leave immutable settled payouts greater than R_i; then A_i retains at least S_i, U_i must have reviewed backing and new capacity is zero. A correction never fabricates funds to preserve an unsupported promise.

Before confirmation, net received = sum R_i minus settled excess returns. Confirmation requires net received = P and no unsettled returns or holds. It freezes F_i, each receipt's purchase funding after settled excess returns, summing to P. Receipts recorded later have F_i = 0. Payment balance describes receipt of the purchase amount; purchase refunds are displayed separately and do not turn a refunded order into an unpaid order.

After corrections, effective original funding F'_i = min(F_i, max(0, R_i - settled non-purchase returns from that receipt)). It never expands original purchase funding. Purchase refund authorization per receipt is capped both by remaining F'_i after effective prior purchase refunds and by available payout capacity. Previously settled purchase refunds survive a downward correction; floor future entitlement at zero. Component limits also apply.

For confirmed orders, new ordinary excess-return capacity per receipt is max(0, R_i - F'_i - effective non-purchase return authorizations), additionally capped by available payout capacity. Reserving the entire purchase funding prevents a purchase refund from making the same money available as surplus. Before confirmation, order-wide excess capacity is max(0, sum R_i - P - effective existing excess-return authorizations), with per-receipt capacity checks.

On open-order cancellation, preserve existing obligations and authorize remaining per-receipt capacity as actual-funds cancellation refunds. On confirmed cancellation, allocate remaining purchase entitlement first, then remaining surplus as returns. A later receipt or upward correction on a cancelled order allocates only max(0, R_i - A_i) as a separate return. Never calculate a supplemental return from the correction delta alone.

## Correction losses

For a confirmed order, compute the order-wide uncovered amount as max(0, P + settled non-purchase returns - sum R_i). Purchase refunds do not increase that amount: they return a portion of the purchase and are not another purchase expense. Separately expose settled payout over-disbursement max(0, sum S_i - sum R_i). The operational funding-shortfall total is the greater of those amounts, not their sum. This is a reconciliation metric, not a profit/loss statement or general accounting ledger. For an open/cancelled-before-confirmation order, loss is max(0, sum S_i - sum R_i). A confirmed order retains its confirmation history for this calculation even after cancellation.

Present funding shortfall and payout over-disbursement as explanatory views of this total, not additive charges. Do not interpret a confirmed-then-cancelled purchase snapshot as earned revenue. Append loss changes/reconciliations as funds are corrected upward or downward. No loss entry reserves receipt capacity, creates customer debt or changes a settled transfer. The correction plan must show per-receipt backing and preserve original-source restrictions even when aggregate funds would cover another source's shortage.

## Shared transaction rules

Every business use case owns one Drizzle transaction and persists its request result, mutations, audit and outbox together. No network, email, upload or physical payout occurs inside it. Recheck predicates after acquiring locks; a preflight UI check is never sufficient.

Acquire required locks in this order, omitting unused categories:

1. Store settings/ordering gate when creating orders or changing store configuration.
2. Source carts, ordered by UUID.
3. Existing orders, ordered by UUID.
4. Correction cases and upload intents, ordered by type then UUID.
5. Payment accounts, then receipts, each ordered by UUID.
6. Refund/return allocations and payout attempts, each ordered by UUID.

Resolve immutable owner IDs before locking, then revalidate their associations inside the transaction. Every financial writer locks its order first. A duplicate correction spanning orders acquires all owners before any receipt lock. New-order creation uses the cart lock and unique source-cart constraint. Catalog/quote version changes require a coherent revalidation strategy: lock relevant version rows in a documented sorted order after the store gate and before carts, and make catalog writers follow the same ordering. Do not mix ad hoc lock sequences.

Use unique constraints for source-cart conversion, order references, request identities and normalized incoming/outgoing account references. Generating human-friendly payment references uses a bounded collision retry loop within order creation before failing. Locking prevents aggregate over-allocation; uniqueness prevents duplicate identities. Bounded deadlock/serialization retries rerun the same complete command with the same request key. Never blindly repeat an external payout.

## Request identity

Scope a stable request key to the authorized actor/session and command. Persist a canonical input fingerprint and result identity. Exact retries return the original result; changed inputs return a conflict. Authorize before exposing a stored result. Different keys for the same cart still return only its one authorized order. Retain financial request identities with financial history.

Payout claims persist before the owner sends. An unresolved attempt is exclusive even after timeout or process restart. Only reconciled transfer evidence or an audited no-transfer outcome resolves it. Unique transfer references supplement, rather than replace, allocation limits.

Under the order/receipt locks, a payout claim must bind the exact amount and an immutable owner-verified original-source destination revision belonging to that receipt. Reject unverified or mismatched destinations. Destination verification changes follow the same locks; they cannot redirect an unresolved attempt. Reconciliation retains the claimed destination and records actual transfer evidence. See the source-verification workflow in [business workflows](business-workflows.md#6-refunds-excess-returns-and-cancellation).

### Payout discrepancies

#### Settlement and claim breaches

The claim is immutable intent; actual transfer evidence must remain recordable even when amount or destination differs. For a new actual outgoing amount T > 0, let U be the allocation's authorized amount minus prior customer settlement across all its attempts. Under the shared locks, compute C = min(T, U) exactly when the actual destination matches the claim's verified source; otherwise C = 0. U must be nonnegative. C is computed, never operator-selected. The remainder E = T - C is erroneous disbursement. Increment S_i only by C, so ordinary allocation invariants remain intact. Preserve T, C and E together with actual and claimed destinations; do not silently clamp the recorded physical amount. Transfer identity is unique across ordinary and discrepant reconciliation, so the same movement cannot be recorded twice. Exact request retries return the stored classification before recalculating against changed balances.

Separately flag a claim-limit breach whenever cumulative actual outgoing amounts attributed to an attempt exceed its immutable claimed amount. This is an operational discrepancy, not an additional monetary loss or a cap on customer settlement. It may coexist with E > 0, but is never added to E. Recoveries do not erase the historical breach. A breach with E = 0 requires reviewed acknowledgment and attempt reconciliation, not a recovery or write-off entry. Never authorize a replacement for money already included in C.

A verified partial transfer with E = 0, no claim-limit breach and no late-evidence conflict is ordinary settlement. Keep its attempt exclusive until evidence establishes the final transferred amount and that no remaining transfer is pending. Then mark the attempt reconciled and allow a new claim only for the allocation's remaining U, subject to all other holds. An uncertain remainder keeps the attempt unresolved. Closing a partially settled attempt never uses no_transfer or changes its original claim amount.

#### Late evidence and replacement attempts

New physical evidence for a closed attempt always opens a late-evidence review hold, even with E = 0 and no claim-limit breach. In the same transaction, lock the order, allocation and its attempts in the shared order; record the actual settlement and mark every unresolved replacement attempt on that allocation reconciliation_required. These attempts stay exclusive and cannot be presented as permission to send. Notify the owner to stop any unsent replacement. Proven unsent replacements close with audited no-transfer evidence; sent or uncertain replacements retain their claims and must reconcile actual outcomes before the hold can clear. Do not automatically release, resize, reopen or resend a claim. Recompute U after all known transfers are recorded; a new claim is permitted only after review and all other holds clear. Sender screens must recheck claim actionability before showing send instructions. An external transfer already initiated cannot be recalled by this transaction; retain and reconcile it, classifying any resulting excess as E. Exact retries of already-recorded evidence do not create new holds.

Track evidenced recoveries against E, capped by its unrecovered amount. Net payout-error loss is sum E minus those recoveries. It is separate from the receipt-based funding-shortfall projection above, which continues to use S_i; never feed E into that projection or count it as customer settlement. Recovery is not a new customer receipt and does not restore or consume refund entitlement. All views expose actual outgoing money, customer settlement and payout-error loss distinctly. Claim blocking, case resolution and replacement authorization follow the workflow hold; no automatic retry follows a discrepancy. Use the existing order and payout-attempt locks to serialize case creation, classification, recovery and resolution.

#### Required payout examples

Required examples: a $50 claim sent to the wrong destination records T=50, C=0, E=50 and leaves $50 owed; after reviewed write-off a replacement $50 settles the obligation while the loss remains $50. A $50 claim actually sent as $70 to the verified source records C=50, E=20; a later evidenced $20 recovery reduces payout-error loss to zero without changing settlement. Race duplicate reconciliation and recovery requests and verify each physical movement is counted once.

Also test a verified $50 transfer against a $50 claim: C must equal 50 and E must equal 0. For a $30 final transfer on that claim, C=30, E=0 and U=20; closing the attempt with evidence permits a new $20 claim without a discrepancy or write-off. If the remaining $20 might still be in flight, reject new claims. Repeating either reconciliation does not increment settlement again.

Cross-attempt examples: (1) A $50 authorization with a $30 claim actually paid as $50 to the verified source yields C=50, E=0 and U=0; flag the claim-limit breach but permit no replacement payment. (2) Close a $50 claim after $30 settlement, start a $20 replacement, then discover a further $20 from the original attempt: record C=20, E=0, U=0 and hold the replacement for reconciliation. If proven unsent, close it without payment; if it also sent $20, record C=0, E=20. Test both reconciliation orders, late-evidence/replacement-claim races and duplicate retries; final customer settlement is $50 and total error is $20 only when $70 was actually sent.

## Required executable examples

| Scenario | Expected result |
| --- | --- |
| $40 order submission response lost | Retry recovers one unpaid order; no second payment request |
| $40 order, $50 received | Return $10 excess; confirm only after it settles |
| Confirmed $40, refund $40, late additional $10 | Original funding remains consumed; only new $10 is excess |
| Unpaid $40 order cancelled | No refund row; late $40 creates a separate return |
| Open order receives $10 of $40, then cancels | Actual-funds cancellation entitlement is $10 |
| $50 handover entered twice | Void duplicate; retain $50 received, no invented $50 payout |
| Confirmed $100 corrected to actual $10 | Preserve P; future purchase funding capped at $10; funding loss $90 |
| Same correction after $30 purchase refund settled | Keep $30 sent; no further entitlement; total funding loss remains $90, not $110 |
| Cancelled open order had $10 refunded, receipt corrected to $100 | Authorize separate $90 return, whether the $10 is pending or settled |
| Two payout claims race | One unresolved attempt; total sent cannot exceed authorization |

Implement table-driven examples and generated operation sequences for money invariants. Test allocation sums, component caps, reference uniqueness, repeated commands, correction reversals, concurrent receipt/cancellation, and fulfillment/cancellation races. Every rule above requires executable evidence before release.
