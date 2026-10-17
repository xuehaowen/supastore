# Error handling and recovery

Every mutation, worker and external adapter must define its failure behavior.
Changes require a coverage-matrix entry, regression tests, and a recovery policy
in the pull request. This contract complements the transaction contracts.

## Boundary contract

Backend APIs and actions use `infrastructure/http/failure.ts`. Domain failures
retain their safe, actionable message. Unexpected exceptions receive a generic
message and generated request ID. APIs return that ID in the body and
`X-Request-ID`; admin actions expose a reference for unexpected failures.
Failure responses are private and never cached.

| Category                       | HTTP      | Recovery                                              |
| ------------------------------ | --------- | ----------------------------------------------------- |
| Validation / invariant         | 400       | Correct input; no automatic replay                    |
| Authentication / authorization | 401 / 403 | Sign in or obtain access                              |
| Missing resource               | 404       | Refresh context or recover access                     |
| Conflict                       | 409       | Reload state; retain mutation identity                |
| `DEPENDENCY_UNAVAILABLE`       | 503       | Retry after the delay; preserve idempotency keys      |
| `OUTCOME_UNCERTAIN`            | 409       | Reconcile persisted/provider evidence before retrying |
| Unexpected                     | 500       | Investigate by request ID; do not assume rollback     |

HTTP status alone never proves whether an external side effect happened. Only
the adapter's submission-certainty contract may authorize automatic replay.
Browser timeouts must preserve form values and mutation identity. Payment and
refund retries use the original provider resource, amount and idempotency key.

Diagnostics contain operation, request ID, approved record identifiers and
bounded machine failure codes. Do not log raw exception messages, SQL, URLs,
request bodies, credentials, customer contact details or uploaded content.

## Notifications

Purchase and authentication emails use the durable outbox.
`ENABLE_OUTBOX_WORKER=true` is required on the backend. Auth acknowledgement
means queued, not sent. Auth tokens live one hour; dispatch stops after 15
minutes of queue delay. Expired queued links are suppressed; request a new
link. Persistence failures are logged. Verification requests report temporary
unavailability; password-reset responses retain account-enumeration protection.

Definite transient SMTP rejection retries at 1m, 5m, 15m, 1h and 6h, for six
attempts total. Known socket failures before DATA are safe to retry. Failures
at DATA or an unknown stage require review. Acceptance is not proof of delivery.
Neither SMTP nor Telnyx SMS is assumed to provide submission idempotency.

Template failures retain `failure_code` and enter `review` before any transport
call. Overview/activity show the reason. Repair and publish templates in
**Settings → Notifications**, then **Retry unsent template reviews**. Only
unattempted, unprepared deliveries with valid deadlines are requeued. Earlier
reviews hold later notifications for the same order/recipient/channel until
resolved; never bypass ordering with bulk resets.

SMS confirmation reserves an attempt before I/O to bound parallel guesses.
Outages refund only that reservation while the same consent/provider claim is
current. Incorrect codes consume attempts; expired codes invalidate the claim;
only explicit approval enables SMS. Start rate limits remain during outages to
bound resend costs.

Inspect deliveries and attempt/result records by delivery ID. Follow the
[outbox reconciliation playbook](playbooks/outbox-reconciliation.md). Auth
payloads/prepared messages contain bearer links: restrict database access and
never copy those fields into logs or support records.

## Payments and worker health

Stripe inbox and checkout polling reserve records for five minutes before I/O.
Failures retain a safe code and per-record backoff from one minute to one hour.
Financial records remain recoverable indefinitely; attempt counts never discard
payments. Workers select due records in retry order and skip locked rows so a
failing record cannot starve newer work. Crash reservations expire automatically.

Payment batches report succeeded, failed, deferred and review-required counts.
The scheduler stores these results and reports degraded health while failures
are deferred or review remains. `/api/health/worker` also returns 503 for
notification review, permanent failures or exhausted retries. Liveness and
database readiness remain separate. Configure an external monitor for this
endpoint; the application does not create one.

Restore failed dependencies and let retry deadlines elapse. For review records,
compare the original payment, order revision, amount and authoritative provider
evidence before resolving the business conflict. Never issue replacement
charges/refunds merely because a response timed out.

## Failure coverage matrix

| Operation                             | Failure and recovery evidence                                                                      | Tests                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| API/admin boundaries                  | Status, safe message, correlation, private errors                                                  | Unit: `failure-contract`, `commerce-api`, `action-failure`, `server-actions`                          |
| Evidence upload                       | Origin/access denial, invalid/oversized data, hidden storage errors, retry                         | Unit: `evidence-upload-route`, `api-routes`; browser `cuj` C6                                         |
| Checkout                              | Invalid/stale quote, consent, retained inputs and duplicate-submission recovery                    | Unit: `checkout`, `server-actions`, `checkout-contracts`; browser `cuj`                               |
| SMTP/OAuth                            | Auth rejection, pre-DATA failure, uncertain submission, timeout/pool recovery                      | Unit: `failure-contract`, `notification-provider-adapters`, `oauth-email`                             |
| Auth queue                            | Atomic queueing, persistence failure, rejection retry, expired links                               | Unit: `auth-email-queue`; integration `outbox-coordination`; browser signup/reset journeys            |
| Templates                             | Diagnostic code, zero sends on failure, owner repair/requeue                                       | Integration: `outbox-coordination`, `notification-template-manager`; browser `notification-templates` |
| Dispatch                              | Concurrency, expired leases, crash after I/O, uncertain outcomes, duplicate/out-of-order callbacks | Integration: `outbox-coordination`; unit `notification-delivery-policy`, `telnyx-webhooks`            |
| SMS verification                      | Invalid/expired codes, outage recovery, bounded attempts, opt-out during I/O                       | Integration: `sms-verification`; unit `notification-provider-adapters`                                |
| Stripe payments/refunds               | Lost responses, original identity, duplicate settlement, mismatch review                           | Integration: `stripe-lifecycle`; unit `stripe-adapter`                                                |
| Stripe reconciliation                 | Failed-record deferral and newer-session progress                                                  | Integration: `stripe-lifecycle`                                                                       |
| Worker supervision                    | Job isolation, partial/deferred failures, recovery, stalls, review backlog                         | Unit: `worker-runner`, `health`                                                                       |
| Inventory/returns/fulfillment/reports | Domain rejection, rollback and safe action diagnostics                                             | `server-actions`, domain unit and integration suites                                                  |

Storefront server actions retain backend request IDs and render validated references
on checkout and redirect error notices. Unit tests `server-request` and `notice`
cover correlation/privacy; browser `error-handling` covers the visible reference.

Customer-page reads also validate nested response contracts before rendering.
Malformed consumed fields produce the existing safe 502 (`Invalid API response.`)
with the backend request ID, without exposing schema issues or payload contents.
Unit `customer-page-contracts` and storefront `page-performance` cover malformed
amounts/statuses, additive fields, cookie/cache isolation and correlation; browser
`customer-page-contracts` validates all eight actual serialized page responses.

Files live under `tests/unit`, `tests/integration` and `tests/browser`. A listed
test is evidence, not a claim that every possible failure is tested. Extend this
matrix whenever adding a failure path.

`pnpm run test:errors` enforces 80% coverage on shared failure classification,
provider classification and worker supervision. CI runs this gate plus the unit
and integration suites. Run affected browser journeys separately and report
execution results separately from test discovery.

Migration `0039_failure_recovery` adds diagnostic/expiry fields and Stripe retry
schedules. Apply it before starting updated backends; update backend replicas
together because older workers ignore the reservations. No new credentials are
required.
