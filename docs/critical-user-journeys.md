# First-release user journeys

These are acceptance scenarios for intended behavior. Keep user experience journeys separate from accounting/concurrency tests. Financial expectations come from [transaction contracts](transaction-contracts.md).

## Merchant and operator journeys

| ID | Journey | Acceptance outcome |
| --- | --- | --- |
| M1 | Protected setup | Owner sets branding, locale/currency, fulfillment, tax, payment and email; actionable missing settings block launch; bootstrap cannot be taken over or reused |
| M2 | Publish product | Create product/variants, images and translations; preview, publish and change availability without rewriting orders |
| M3 | Product import/export | Preview invalid and duplicate SKUs, select valid changes, resume a retry without duplicate products; exported products preserve importable IDs; order export is read-only tooling |
| M4 | Staff access and removal | Staff can receive/fulfill orders but cannot export customers, change settings or authorize refunds; removal blocks the next private request |
| M5 | Owner recovery | Documented recovery restores legitimate owner access without a public bootstrap bypass; last-owner removal is prevented |
| M6 | Pause orders | Pausing rejects new submissions with cart retained; tracking, receipts, fulfillment and refunds for existing orders still work |
| O1 | Install and demo | Clean checkout reaches a seeded synthetic order lifecycle using documented commands |
| O2 | Restore and upgrade | Restore database/assets with sends disabled, verify access/history and reconcile external operations before resuming workers; rehearse migration and repair guidance |

## Customer journeys

| ID | Journey | Acceptance outcome |
| --- | --- | --- |
| C1 | Browse and select | Browse before fulfillment choice; search/filter, empty results, unavailable variants and missing images have usable states |
| C2 | Persistent cart | Refresh, browser back and language switching retain selections; invalid quantities are explained; expired sessions offer safe recovery/restart without exposing another cart |
| C3 | Shipping and pickup quote | Supported destination or valid pickup time produces a clear total; unsupported regions, changed prices and incompatible items require action without silently discarding the cart |
| C4 | Accept and place order | One accepted quote creates one open order before showing payment instructions; confirmation page sets scoped session cookie / client storage, displays stable order number, short payment reference code (`SP-XXXX`) with 1-click copy, and pending-payment status |
| C5 | Lost submission response | Same-key retry or cart lookup recovers the authorized existing order; no duplicate order and no instruction to pay twice |
| C6 | Payment evidence | Interrupted upload retries against the same order; validation errors are readable; pending review is visible and a screenshot is not presented as payment confirmation |
| C7 | Free order | Zero-total order confirms without method/evidence when fulfillment is valid; admin gets submission and customer gets one confirmation |
| C8 | Tracking access recovery | Refresh works in a valid session; lost/expired link can be reissued through single-use email verification; another order number/email alone reveals nothing |
| C9 | Email failure | Existing scoped session in client storage/cookie still displays and tracks the order; admin sees failed delivery; no email-only dependency prevents customer tracking |
| C10 | Changed unpaid terms | Owner proposes a pre-receipt change; instructions pause and customer accepts the new total explicitly; a receipt arriving first invalidates the proposal, preserves the last accepted total, and displays actual receipt amount and balance for partial, exact and excess payments |
| C11 | Cancellation request | Support contact is visible; customer understands only the owner can cancel and that external return may still be pending |
| C12 | Unavailable accepted purchase | Staff communicates inability to fulfill; cancellation handles actual funds without silently replacing items or changing prices |

## Daily administration journeys

| ID | Journey | Acceptance outcome |
| --- | --- | --- |
| A1 | Daily queue | On mobile find unpaid/review-needed, overdue, preparing, payout-pending and failed-email work; actions show what remains to do |
| A2 | Record and confirm | Verify actual transfer or cash, confirm selected receiving account on admin prompt, record receipt once and confirm only with exact payment and valid fulfillment; underpayment does not automatically request another transfer |
| A3 | Fulfill pickup/shipping | Prepare, print packing slip, mark ready or ship with tracking; pickup recipient is verified via scoped order page or recorded owner-assisted verification; order number/contact alone fails; audited handoff/manual delivery completes order |
| A4 | Correct fulfillment | Audit same-cost address correction, tracking correction or agreed valid pickup reschedule; notify customer; a cost change after payment requires cancellation/new order |
| A5 | Refund versus cancellation | Screen explains whether fulfillment continues; owner can refund purchased components or cancel eligible orders and reconcile funds |
| A6 | Partial original-source refund | Remaining entitlement and verified payer destination are visible; unverified destinations block claims; claim binds the destination revision, then owner sends and reconciles a partial/full payout; an unresolved attempt cannot be redirected |
| A7 | Overpayment and late payment | Return surplus before confirmation; payment after cancellation creates separate return work without reopening order |
| A8 | Uncertain or incorrect payout | Lost response leaves claim blocked; actual wrong-destination/excess payout opens a discrepancy hold; owner records actual movement and reviewed resolution before replacement; customer entitlement and merchant payout-error loss remain distinct |
| A9 | Wrong receipt | Correct duplicate/wrong amount through a reviewed hold; preserve settled history, show unsent changes and funding shortfall; dismiss a correct entry without posting money |
| A10 | Abandoned unpaid order | Review deadline alerts staff; owner checks actual payments and cancels deliberately; an unpaid purchase does not appear to require refunding its full total |

## Accounting and concurrency checks

These are implementation verification areas, not additional customer screens. Execute the full linked contracts, including their examples and race cases; this index does not redefine expected calculations.

| Coverage area | Source of expected behavior |
| --- | --- |
| Pricing, precision, component limits and corrections | [Financial projection and calculations](transaction-contracts.md#purchase-calculation) |
| Cart conversion, command retries and competing writers | [Shared locks](transaction-contracts.md#shared-transaction-rules) and [request identity](transaction-contracts.md#request-identity) |
| Payout settlement, partial finality, claim breaches and cross-attempt races | [Payout contracts and executable examples](transaction-contracts.md#payout-discrepancies) |
| Receipt identity, duplicate investigations and unsupported account repair | [Receipt corrections](business-workflows.md#7-receipt-corrections) |
| Confirmation, cancellation, shipment and handoff races | [Workflows](business-workflows.md) under the shared transaction locks |
| Immutable evidence, staging overwrites and cleanup races | [Payment evidence workflow](business-workflows.md#3-payment-and-confirmation) |
| Guest isolation, stale credentials and private storage grants | [Authorization boundary](architecture-overview.md#authorization-boundary) |
| Guest cleanup and retained order/request history | [Data retention](database-schema.md#retention-and-automated-housekeeping) |
| Delivery ordering, lease recovery, retries, stale messages and exhausted-message retention | [Events contract](api-events-spec.md) |

Use generated operation sequences alongside every financial example. Authorization tests exercise endpoints/use cases and actual database/storage grants. Use synthetic data and no live transfers. Record evidence against journey IDs and roadmap milestones so completion is traceable.

## Usability and release evidence

Exercise keyboard and screen-reader flows, readable validation and focus handling, touch targets, mobile queues, slow-network/loading states and empty/error states. Pilot the ordinary configure -> buy -> pay -> fulfill -> refund journey before expanding features. Record observed setup and task-completion results; documents alone do not complete a journey.
