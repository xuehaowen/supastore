# Business workflows

This document owns user operations and state transitions. [Product scope](product-scope.md) defines release boundaries; [transaction contracts](transaction-contracts.md) define money, locks and retries.

## 1. States and authority

| Dimension | States and rules |
| --- | --- |
| Order | open -> confirmed -> completed; open/confirmed -> cancelled before shipment or pickup handoff |
| Payment review | not_required, pending, needs_correction, verified; evidence review does not create a receipt |
| Payment balance | Derived from effective receipts and settled excess returns: no_payment_due, unpaid, underpaid, paid, overpaid |
| Fulfillment | unfulfilled -> preparing -> ready_for_pickup -> fulfilled, or preparing -> shipped -> fulfilled; eligible cancellation -> cancelled |
| Refund/return | Authorized amount and settlement progress shown separately; pending, sending, partially_settled, settled or correction_reduced |

Staff can record actual receipts, confirm payment and fulfill orders. Owner-only operations include price changes, cancellation, refunds, receipt corrections and payout execution. Customers cannot verify receipts, set prices or cancel orders. Every private use case checks the permission matrix in [architecture](architecture-overview.md).

Preparation requires confirmation. Pickup handoff or manually recorded delivery atomically completes fulfillment and the order. Shipment and cancellation share the order lock and recheck prerequisites. Shipped/completed orders use refunds; refunds alone do not stop fulfillment. Cancelled/completed lifecycle is terminal, but receipt and payout reconciliation remains possible.

## 2. Cart, quote and order creation

Customers browse before choosing fulfillment. Preserve their owned cart across refresh and language changes. On checkout, validate positive quantities, availability, destinations, shipping rates, tax and pickup notice. Explain incompatible items without deleting them. Client prices are never authoritative.

Create a server quote bound to cart ID/revision, expiry and the relevant catalog/settings versions. It includes the full payable total, item and fulfillment snapshots, chosen payment method/account and terms. A quote contains no instructions to send money. Require explicit acceptance of changes to price, fulfillment or terms.

Initial quote lifetime is 15 minutes.

On submission, authorize the guest cart and acquire the cart lock. An exact successful retry returns the existing order. Otherwise require a matching, unexpired quote and revalidate current inputs; a material change returns a replacement quote for acceptance. In one transaction create the open order and immutable purchase snapshot, assign a display order number and a human-friendly checksummed short payment reference code (e.g. `SP-XXXX`, generated from Crockford Base32 with a check character and bounded collision retry), convert the cart, record the request identity and emit order.submitted. Enforce one order per source cart across request keys. A new purchase uses a new cart.

Only after commit display payment instructions, the stable order reference and short payment reference code, issue the scoped session token in an HTTP-only secure cookie (with `sessionStorage` retention as a client helper), and send the acknowledgment email. For a zero-total order, confirm in the creation transaction if fulfillment remains valid; no method or proof is required. If a request times out, query/retry the same operation and display the existing order. Never prompt a second payment because the response was lost.

The accepted order is independent of subsequent cart, price and configuration changes. Availability is not reserved: if staff cannot fulfill it, contact the customer and cancel through the normal process. A paused store blocks new order creation under the store lock but permits all existing-order work.

## 3. Payment and confirmation

Each order selects one manual method/account and requests full payment; no installment or mixed-tender checkout is offered. Display clear transfer details, a 1-click copy button for the exact amount and payment reference code, and standard transfer QR codes where supported. Cash instructions require collection before confirmation and preparation. A payment-method rename or archive preserves the historical account and order instructions. Owners can stop displaying unsafe instructions with an audited notice and arrange cancellation; changing a method never silently redirects an accepted order's payment destination.

Payment evidence accepts JPEG, PNG and WebP files smaller than 5MB. Evidence uploads attach to an existing authorized order. Create an expiring private upload intent, upload directly to storage outside the database transaction, then validate/finalize the object reference by verifying allowed file size, declared MIME type, and file magic bytes (inspected via partial byte-range read `Range: bytes=0-2047` on the candidate object). Interrupted uploads can retry without creating an order or receipt. Expired intent cleanup must not delete finalized evidence. Payment evidence is not a receipt.

Presigned uploads target staging keys only. Finalization copies the staged bytes outside the database transaction to a new private server-only candidate key, then validates that candidate's size, MIME type and magic bytes via partial range read. The candidate is never overwritten and is not accessible to customers before finalization. Under the order/upload-intent locks, recheck authorization and expiry and attach the validated candidate exactly once. Competing retries return the winning evidence record. Downloads always use that immutable final key, never the staging key; later staging overwrites cannot change reviewed evidence. Cleanup marks intents expired under the same locks and deletes only staging or unattached candidate objects after excluding active finalizations and committed evidence references. Test overwrites during copying, validation and after finalization, plus cleanup/finalization races.

Staff verifies actual transfers or cash collection and records amount, currency, durable account, unique reference and actor. Cash uses an internally generated receipt number and durable collection request key. Exact retries reuse the record; a second physical payment needs a new receipt. Multiple actual receipts are allowed for reconciliation of mistakes. Staff must agree any underpayment resolution with the customer rather than automatically issuing another payment request. Drawer reconciliation detects duplicate entries under different keys.

Confirm only when net receipts exactly equal the payable total, evidence review is satisfied where required, no unsettled excess return or accounting hold exists, and fulfillment is valid. Recording a receipt remains possible when timing or a hold blocks confirmation. Confirmation freezes original receipt funding. Late extra receipts remain surplus and do not increase purchase value or refund entitlement.

For rejected evidence, show needs_correction, the reason and a correction deadline. New evidence returns to pending. At expiry alert staff once per revision; do not infer nonpayment or cancel automatically.

## 4. Unpaid orders and permitted changes

Open unpaid orders stay visible in the merchant queue. A configurable unpaid review deadline prompts staff; it does not silently cancel an order that might have received an unrecorded transfer. No automatic credit restoration is needed because core has no store credit.

An owner may revise an open order's price only when no receipt has ever been recorded and no refund/return authorization exists. Preserve the old snapshot, reason and proposed new total. Suppress payment instructions while customer acceptance is pending; changed terms require acceptance through scoped order access. Keep one pending proposal and reject stale revisions. Withdrawal restores the prior agreed instructions. Any receipt arriving before acceptance invalidates the proposal and is reconciled against the last accepted purchase; it must not apply new terms automatically. Cash follows the same rule.

Once any receipt is recorded, changing price requires cancellation/refund and a separately accepted new order. No post-payment price-change return workflow exists. Confirmed purchase totals never change.

An address correction before shipment must revalidate eligibility. For an open unpaid order, changed cost follows the acceptance rule above. Once paid, allow only same-cost corrections within supported shipping rules, audit them and notify the customer; otherwise use cancellation/new purchase. Pickup rescheduling validates notice and availability, records customer agreement and notifies them. It never silently changes the price.

## 5. Fulfillment

Display payment and preparation deadlines separately. For pickup, calculate the review deadline from the chosen time minus minimum preparation notice in the location timezone. Alert staff once per schedule revision when overdue. Confirmation rechecks notice, including free orders; invalid timing requires an agreed reschedule or cancellation.

Staff prepares confirmed orders, prints packing slips, marks pickup ready, or records carrier/tracking and shipment. Tracking corrections retain old/new values and send an update. Without a carrier integration, staff explicitly records delivery to complete a shipped order. Do not infer delivery from a tracking number or elapsed time.

Pickup handoff requires staff to verify the recipient using the scoped order page presented by the customer, or owner-assisted identity verification when that access is unavailable. Record the verifying actor and handoff time; assisted handoff also records the verification basis without copying unnecessary identity documents. An order number or matching contact text alone is insufficient. A separate pickup code is not part of the first release.

Customers contact the store for cancellation. The owner cancels only before shipment/handoff. The UI distinguishes 'Refund money' from 'Cancel order and resolve funds' and shows whether fulfillment will continue before committing.

## 6. Refunds, excess returns and cancellation

Only original-source payouts are supported. The owner selects amount, purchased components where applicable and reason. Authorize under the order/receipt locks using remaining entitlement and per-receipt capacity. Pending authorizations reserve funds immediately. There is no store-credit destination and no cash payout of an unrelated transfer. Preserve original account/source references if a method is archived.

For transfers, distinguish the merchant's receiving account from the payer's return destination. Before claiming a payout, the owner verifies that destination against the original transaction's bank/provider evidence and records the evidence reference, verified destination, actor and time. Customer-provided details alone are insufficient. If the source cannot be verified or cannot receive a return, keep the obligation pending for owner resolution; do not substitute another destination. Bind each claim to an immutable verified destination revision and show it before sending. A destination correction requires new verification and cannot alter an unresolved or settled attempt. For cash, verify the original payer or their documented authorized recipient and retain the recipient acknowledgment at settlement.

For a confirmed order, purchase refunds cannot exceed the frozen purchased components or their effective original funding. A genuine overpayment is a separate excess return, never extra purchase entitlement. For an open order, use cancellation to return actual collected money; do not represent the unpaid requested total as a refundable amount.

Cancellation preserves settled transfers and existing authorizations. For an open order, authorize only remaining actual received funds not already allocated. For a confirmed order, authorize remaining purchase entitlement and separately return unallocated surplus. Store an actual-funds cancellation entitlement for open orders; zero funds create no refund row. Commit lifecycle, fulfillment cancellation, new obligations, audit and events together. Existing or new payouts stay actionable after cancellation.

Late receipts on a cancelled order create an original-source return for their unallocated funds in the same transaction; they do not reopen the purchase. A cancelled unpaid order that later receives $40 owes a separate $40 return.

Before physically sending money, the owner claims an allocation with a durable attempt ID and exact amount. A second sender is rejected. A timeout leaves sending/uncertain state; it never releases the claim. Reconcile the existing transfer or record verified no-transfer evidence before a new attempt. Partial transfers leave only the unpaid authorized remainder. Cash requires a disbursement number and recipient acknowledgment. Unique outgoing references and capacity checks apply to every refund and return. Workers never send money.

Ordinary refund/return authorizations cannot be withdrawn or reused. An uncertain attempt blocks cancellation or corrections until reconciled. A supported correction may reduce only unsupported unsent obligations as described below.

Verified partial payouts within the claim and remaining authorization are ordinary settlement. Record the exact amount using the canonical calculation. Close the attempt as reconciled only when evidence establishes that the remaining claimed amount is not still pending; otherwise keep it exclusive. Once closed, a new claim may cover the remaining authorization if no other hold applies. No discrepancy or write-off is required for a correctly settled partial payout.

If a physical payout has erroneous disbursement E > 0, exceeds its claim limit, or introduces new evidence for a closed attempt under the transaction contract, record an owner-only payout discrepancy instead of rejecting the evidence or declaring no transfer. Preserve the claimed amount/destination and append the actual amount, actual destination, unique transfer reference, evidence and actor/time. Hold the order against new payouts, cancellation, receipt corrections and fulfillment while the owner investigates; permit incoming receipts and reconciliation. A wrong-destination transfer does not settle the customer's obligation. A transfer to the verified source settles the allocation's remaining authorized obligation even when it exceeds the individual claim. The claim-limit breach is an operational discrepancy; only money beyond the obligation is erroneous disbursement. Record erroneous disbursements and evidenced recoveries separately from customer settlement, without inventing receipt corrections or increasing authorizations. Resolution requires a reviewed classification of all actual funds and reconciliation of affected attempts. A recovery or write-off decision is required only for E > 0; a claim-limit breach with E = 0 requires acknowledgment without a monetary loss entry; only then release that case's hold and permit a new claim if no other hold remains. A write-off does not erase the transfer or forgive the customer's refund entitlement. Subsequent recoveries append to the same case. Workers never resolve discrepancies or send replacement payouts.

Late evidence for a closed payout attempt places any unresolved replacement on the same allocation into reconciliation-required review, even if no excess money is yet recorded. Stop unsent replacements and obtain no-transfer evidence; keep already-sent or uncertain replacements exclusive until reconciled. Sender screens recheck actionability before displaying instructions. Review all affected transfers and remaining entitlement before releasing the case hold. Do not change the old claim or automatically initiate another payment. Follow the cross-attempt examples in the transaction contract.

## 7. Receipt corrections

The owner can correct an erroneous entry with evidence; returning money that never arrived is not a correction. Open a case and hold each affected order against new payouts, confirmation, price changes, cancellation and fulfillment. Allow recording real incoming receipts and reconciliation of existing payout attempts. Permit at most one open correction case per affected order. A duplicate involving two orders locks and holds both in deterministic order.

Dismiss a correct receipt with evidence and no monetary entry. To apply a correction, reconcile uncertain attempts, revalidate the case against current financial revisions and append a signed delta. Effective receipt amount cannot be negative. A duplicate void links the surviving receipt and preserves both original references. An increase must substantiate the original payment; a new payment is a new receipt.

Wrong receiving-account reassignment is deferred from the first release. Amount deltas and duplicate voids must not change a receipt's account, currency or reference identity, and staff must not void/recreate a payment to bypass that restriction. Before recording a receipt, the admin interface must present an explicit confirmation step showing the durable receiving account name and details, requiring staff verification against the actual transaction before committing. If an existing receipt has the wrong account, open an owner investigation and retain its hold; do not mark it repaired through an amount correction or authorize payouts based on the incorrect source. An account-reassignment design covering identity collisions, funding and historical payout verification is required before such a case can be repaired in the application.

Retain confirmed purchase snapshots and settled payouts. Recompute effective original funding, reduce only unsupported unsent allocations, and record any uncovered purchase or excess disbursement as merchant loss. Do not charge the customer automatically. Review and commit all deltas, allocation revisions, loss changes, audit and notifications atomically before releasing holds. Subsequent corrections create linked cases and re-evaluate existing dispositions; losses cannot be counted twice.

For cancelled orders, additional corrected funds not already consumed by effective obligations create supplemental original-source returns in that same transaction. Preserve the original cancellation entitlement. For open/confirmed orders, display newly uncovered surplus for ordinary return authorization. See [canonical calculations and examples](transaction-contracts.md).

## 8. Access recovery and customer communication

Email recovery exchange tokens expire after 24 hours or first use. The browser's scoped order session supports tracking and evidence upload. A lost/expired link can be recovered through a rate-limited email verification flow (enforced via reverse proxy and application in-memory token buckets) with generic responses. Exchange a single-use token for a bounded order session; do not consume tokens on passive email-link preview. Contact text and order number alone reveal no private details.

Email failures appear in the admin queue; they do not roll back an order. Customers with a valid session can still track it. Customers without session or working email need owner-assisted identity verification; staff must not disclose an order based only on a matching contact string. Use transactional templates and store support details; a general messaging inbox is deferred.
