# Merchant setup and operations

This is the merchant task guide. The [journey index](critical-user-journeys.md) tracks acceptance outcomes and coverage; [business workflows](business-workflows.md) define the complete rules; [current capabilities](system-capabilities.md) records implemented features and limitations.

## Setup

1. Create admin users through trusted commands in a terminal, establishing their authentication identity and active owner/staff membership. Then sign in and complete protected store setup. The admin UI has no user creation/invitation flow; Settings manages only existing memberships. Customer registration does not grant admin access. Demo seeding is not a general production staff-provisioning procedure.
2. Set branding, support/policy pages, locale, timezone and currency.
3. Configure shipping, optional pickup, tax, a manual payment account or cash drawer, and email. Send a test message.
4. Add products, variants, images and translations, or preview a product CSV import.
5. Complete a synthetic purchase, payment, fulfillment and refund before launch.

The owner overview and Store setup now show a **Next step** link for the first
missing configuration item. Follow it, save the relevant settings, and return to
the checklist. Completed configuration does not prove that a real payment,
transactional email or backup restore works. Rehearse synthetic purchases only
in disposable fixtures; perform real provider acceptance as a separately
authorized controlled transaction. See [selling readiness](selling-readiness.md)
for the current implementation and remaining launch acceptance.

Currency locks after the first order. Placement reserves tracked stock and configured slot capacity; untracked variants require an explicit count to enable stock tracking. Cash must be collected before preparation. Installation requires an application host, database, object storage and email provider; see the [deployment guide](two-service-deployment.md).

## Find and process an order

Use the daily queue to find unpaid, evidence-review, overdue, preparation, payout and failed-email work. Locate an existing order by its reference; do not recreate it because the customer's page response failed.

Verify actual payment and verify the selected receiving account on the admin confirmation prompt before recording a receipt. A screenshot is supporting evidence only. Confirm when the admin shows that payment and fulfillment prerequisites are satisfied. Agree underpayment resolution with the customer; return excess before confirmation. Deadlines prompt review rather than automatic cancellation.

See [payment and confirmation](business-workflows.md#3-payment-and-confirmation).

## Changes and fulfillment

Before any receipt, an owner can propose changed terms for customer acceptance. After a receipt, a price change requires cancellation and a new agreed purchase. Same-cost address corrections and agreed pickup rescheduling are audited.

Prepare confirmed orders, print packing slips, mark pickup ready or record shipment, and explicitly record handoff or delivery. At pickup, verify the customer's scoped order page or use owner-assisted verification. An order number or matching contact text alone is insufficient.

See [permitted changes](business-workflows.md#4-unpaid-orders-and-permitted-changes) and [fulfillment](business-workflows.md#5-fulfillment).

## Refunds and payment problems

| Task                                               | Merchant action                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Refund while continuing fulfillment                | Choose refund; review entitlement and original-source destination                                    |
| Stop an eligible order                             | Choose cancellation; inspect actual funds and remaining return work                                  |
| Send a payout                                      | Verify the payer destination using transaction evidence, claim, send, then record the actual outcome |
| Correct partial payout                             | Record settlement; establish that no remainder is pending before claiming the rest                   |
| Uncertain transfer                                 | Keep the claim blocked until the outcome is evidenced; never treat timeout as no transfer            |
| Wrong destination, excess transfer or claim breach | Record actual evidence and complete discrepancy review; do not pay money already settled again       |
| Late evidence for a closed attempt                 | Stop unsent replacements and reconcile every affected attempt                                        |
| Wrong receipt amount or duplicate                  | Open a reviewed correction; preserve actual payment and payout history                               |
| Wrong receiving account                            | Open an investigation hold; account reassignment is not supported and void/recreate is not a repair  |

Only the owner authorizes cancellation, refunds, corrections and payouts. Refund alone does not stop fulfillment. Payouts are performed externally; the application records and coordinates them. Customer-provided destination details alone do not verify an original source. If verification is unavailable, leave the obligation pending for owner resolution.

The [refund and payout workflow](business-workflows.md#6-refunds-excess-returns-and-cancellation) explains review and replacement rules. [Receipt corrections](business-workflows.md#7-receipt-corrections) define supported repairs. The admin must distinguish remaining customer entitlement from merchant loss.

## Catalog, stock, credit, and returns

Create products as drafts, add variants or map existing variants to reusable options, then review publication. Option generation preserves existing variant identity and creates only missing selected combinations. Collections group products independently of categories; specifications describe products without creating additional SKUs.

Open inventory tracking with an explicit physical count. Active reservations reduce sellable stock; fulfillment consumes stock and cancellation releases unfulfilled holds. A count below reservations shows a shortage and blocks fulfillment until resolved. Inspect movement history and the overdue pending-order queue; holds do not expire automatically.

Issue store credit to a stable customer profile with an audit reason. Credit reservations are captured on confirmation and released on unpaid cancellation. Partial refunds restore original credit and external-payment sources separately. External payouts still require evidence of their actual outcome. Review the reconciliation report and export the immutable credit ledger when investigating differences.

Physical returns require an eligible fulfilled order and cannot exceed its remaining purchased quantity. Approve the request, then record restockable or damaged units. Receiving goods changes stock independently of authorizing a refund. Inspect both approved and settled refund totals before considering a case complete.

## Account access and maintenance

Customers use scoped tracking sessions or email recovery. If neither works, use owner-assisted identity verification. Failed emails remain actionable until delivered or explicitly resolved; review them in the queue. See [access recovery](business-workflows.md#8-access-recovery-and-customer-communication).

Owners manage staff, settings and exports. Preview imports before applying selected changes; order import is unsupported. Pause new orders when needed while continuing existing-order work.

If copying a payment amount or reference is unavailable in the customer's
browser, the order page explains how to copy the displayed value manually and
allows another copy attempt. A failed copy is not a failed order or payment;
do not create a replacement order for it.

Back up database and assets, rehearse restore with sends disabled, and follow the [upgrade and recovery guide](development-deployment.md#backups-and-upgrades). These procedures must be tested before release.

### Ledger navigation

Credit and stock history show 25 entries at a time. Use Older entries or Older movements to continue from the last exact timestamp and ID; new entries do not shift already viewed pages. Latest entries returns to the current ledger. Credit CSV export streams batches using the same stable order. Entries appended during export may be included; the file is not a frozen accounting snapshot.
