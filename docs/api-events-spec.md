# Events and notification contracts

## Event catalog

| Event | Source | Recipient |
| --- | --- | --- |
| order.submitted | Durable order creation | Admin; customer acknowledgment/instructions unless immediately confirmed |
| order.confirmed | Payment or valid zero-total confirmation | Customer |
| order.change_proposed / order.change_accepted | Eligible unpaid-term proposal or acceptance | Customer |
| order.change_invalidated | Receipt arrives while a proposal is pending | Owner; customer explanation |
| order.unpaid_review_due | Unpaid deadline revision | Admin |
| payment.correction_requested / payment.correction_overdue | Evidence review or expired correction deadline | Customer / admin respectively |
| fulfillment.review_overdue | Pickup deadline revision | Admin |
| fulfillment.rescheduled / fulfillment.address_updated | Audited agreed change | Customer |
| fulfillment.ready_for_pickup / fulfillment.shipped | Fulfillment transition | Customer |
| fulfillment.tracking_updated | Audited tracking correction | Customer |
| order.completed | Handoff or manually recorded delivery | Customer if enabled |
| order.cancelled | Owner cancellation | Customer |
| refund.authorized / refund.settled | Purchase/cancellation refund obligation or final reconciliation | Customer |
| payment_return.authorized / payment_return.settled | Excess, late or supplemental return obligation/completion | Customer |
| receipt.correction_applied | Reviewed receipt and allocation corrections commit | Owner; customer if balance or promised return changed |
| receipt.correction_dismissed | No-change investigation closes | Owner |
| payout.discrepancy_recorded / payout.discrepancy_resolved | Monetary error, claim-limit breach or late-evidence review / owner completes reconciliation | Owner, including stop/reconcile instructions for affected replacements; customer only if their settlement status changes |

Creation always emits order.submitted once, including owner-created and free orders. Immediate confirmation sends the admin submission message and one customer confirmation. Do not send a separate customer acknowledgment with payment instructions in that case. Cancellation messages link to existing refund/return status instead of implying that money has already been sent.

The order.change_invalidated message explains that the last accepted terms still apply and shows the actual receipt amount and resulting balance at that revision. Partial or excess receipts also invalidate a proposal; the message must not imply that the exact purchase total was received or that the order is confirmed.

## Envelope and delivery identity

Persist event ID, unique business event key, schema version, order ID, monotonically increasing per-order sequence, operation identity, committed time, recipient/locale snapshot and immutable display values. Quote/payment details refer to an accepted order snapshot, never mutable current catalog data. Refund/return messages distinguish authorization from physical settlement.

One delivery identity exists per event+recipient+channel. Adapters accept that identity, template, variables and recipient, returning provider ID or a classified failure. Reuse stable provider idempotency keys when supported. Keep secrets out of logs and client-visible payloads.

## Ordering and stale messages

Dispatch one active delivery at a time per order+recipient+channel, in aggregate sequence. Before sending an action-request message, check its expected order/payment/proposal revision. If cancelled, confirmed or superseded, mark obsolete payment instructions, evidence requests and change proposals suppressed with a reason. Never silently rewrite historical event payloads to look current.

A terminal delivery failure must not permanently block later messages: record its exhausted state and let subsequent eligible messages proceed. Admin retry rechecks relevance before dispatch. Cancellation and settlement messages must remain deliverable even if an older acknowledgment failed.

Exhausted means automatic retries stopped, not operationally resolved. Retain exhausted deliveries, their events, identities, attempt history and encrypted retry material while actionable, regardless of age. An owner may retry or explicitly resolve/suppress with actor, time and reason; an uncertain send must retain its uncertainty in that decision. Retrying preserves provider identity and exact request material. An expired access token requires a separate authorized reissue, never token substitution in the old request.

Cleanup may prune payloads and encrypted retry material only 30 days after successful delivery or explicit resolution/suppression, with no active lease or retry. An event becomes eligible only when every recipient/channel delivery is eligible. Retain compact event/delivery identity tombstones and resolution audit so pruning cannot recreate an old delivery or erase deduplication. A resolved/pruned delivery cannot be retried; any necessary new message is an explicit new operation with a new identity. Test an exhausted delivery older than 30 days, a mixed delivered/exhausted event, and a cleanup/retry race.

A state change can occur while an email is already in flight; external delivery cannot be recalled or perfectly ordered. Emails direct customers to the current scoped order page before paying, and that page enforces current status. Do not claim exactly-once or perfect external ordering.

## Worker lifecycle and retry

The initial retry schedule is five retries after the initial attempt: 1 minute, 5 minutes, 15 minutes, 1 hour and 6 hours, followed by exhausted status. Verify six unsuccessful total attempts. Scheduling lives here; deployment configures process supervision and the roadmap tracks implementation.

Business mutations, request result, audit and outbox insertion commit in one transaction. By default the worker runs as an in-process loop in the application container (initialized via `instrumentation.ts` on the Node.js runtime or a standalone server runner), with optional dedicated worker mode. Container restart policy supervises the process; a failed loop must surface unhealthy status and trigger recovery. It claims database-backed leases in short transactions using `SELECT ... FOR UPDATE SKIP LOCKED`, commits before contacting a provider, and acknowledges in a separate transaction. Transaction advisory locks may serialize claims but release at commit and do not establish persistent leadership. Lease claims enforce one active stream per order+recipient+channel. It uses unique lease tokens, uses bounded backoff and allows only the current token owner to acknowledge. Recover expired leases; temporary deployment overlap uses the same coordination rules. Workers perform no financial effects.

On shutdown stop claiming work, allow a bounded completion interval and leave unacknowledged work recoverable by lease expiry. Expose worker liveness, last successful scan, oldest pending delivery and exhausted counts separately from web health. A worker failure must be visible and recovered by restarting the loop or its container.

After an uncertain provider send, retry with its idempotency key where supported; otherwise delivery is at-least-once and may duplicate. Deadline events deduplicate by order+deadline type+revision.

## Tracking links and delayed messages

Persist order references and link purpose in events, not long-lived plaintext guest secrets. Generate a bounded single-use email-access token on the first dispatch and keep the exact provider request/retry material encrypted with explicit retention. Retries reuse the same payload and provider identity, including after an uncertain send; do not rotate a token inside an existing provider request. An expired delivered link offers rate-limited reissue without revealing order existence. Reissue is a new authorized access operation and delivery identity.

Passive GET/link previews do not consume verification; explicit exchange establishes a bounded scoped session. Email URLs and guest secrets must not enter analytics or ordinary logs. Auth owner/staff verification and reset use the configured Auth integration. General messaging and other channels are deferred.
