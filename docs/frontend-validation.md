# Frontend validation and CUJ coverage

This audit maps the implemented customer and admin interfaces to executable checks. It does not equate action dispatch coverage with exhaustive UI state coverage or completion of every intended feature in `critical-user-journeys.md`.

## Reproduce

- `pnpm run typecheck`
- `pnpm test` — unit tests and the synthetic lifecycle.
- `pnpm run test:frontend:coverage` — 90% minimum line, statement, function and branch coverage for `src/app/actions.ts` and `src/app/client-requests.ts`.
- `pnpm run test:coverage` — existing independent domain coverage gate.
- `pnpm run test:integration` — dedicated PostgreSQL cluster on port 55438.
- `pnpm run test:browser` — creates a fresh UTF-8 database, seeds synthetic products and accounts, starts Next on 3100, private storage on 9009, and a loopback-only mail sink on SMTP 25259 / HTTP 9010. No mail is relayed externally. The outbox worker is disabled. Test PostgreSQL uses port 55439 and an isolated Next cache; application database settings are not reused.
- `pnpm run test:browser -- --grep "M3 CSV"` — run an individual journey against its own fixtures.

On this Windows host the global npm shim is broken; the equivalent direct Node entrypoints were used. The runner propagates failures and stops its own service processes. It requires permission to stop child process trees on Windows. Chromium must already be installed (`pnpm exec playwright install chromium`). CI now invokes this same isolated browser runner instead of bypassing it with an incompatible shared database.

## Recorded verification

Final results are recorded below after execution. Coverage percentages refer only to the two request modules named above, not the entire frontend.

- Unit + synthetic lifecycle: 401 passing tests.
- Request modules: 98.39% statements/lines, 95.68% branches, 100% functions. Client request helpers alone: 100% in each metric.
- Database integration: 24 passing tests, including four new real lock-wait tests for payout claim, reconciliation, closure and discrepancy resolution.
- Browser: 38 passing Chromium journeys against a fresh isolated database and local mail/storage fixtures.
- TypeScript: passing.

## Customer journeys

| Journey | Executable evidence |
| --- | --- |
| C1 browse/select | `cuj.spec.ts`: search/filter, empty result, category state. `m1.spec.ts`: unavailable product. `boundaries.spec.ts`: multiple variants and Chinese product title. |
| C2 persistent cart | Refresh, quantity edit/removal, language switch (`cuj`, `m1`); malformed quantity (`request-rejections`); request/session boundaries and cart ownership (`server-actions`, integration `m1`). |
| C3 quote | Shipping and pickup, blank address, unsupported destination with a restricted test zone, expired quote, pickup calendar week/month navigation, and cart retention. |
| C4 acceptance | Required explicit consent, actual order creation, stable reference and copy action; scoped session across reloads. |
| C5 lost response | Browser commits the POST, drops its response, revisits the quote and retries; asserts exactly one stored order and the same reference. |
| C6 evidence | Browser intent/upload/finalize and retry after failure; client tests stop each failed stage; route tests cover body size, MIME, IDs, empty upload, authorization, finalized-only viewing and private grants; integration exercises immutable candidates and finalization races. |
| C7 free order | Actual zero-price pickup submission; confirms without payment/evidence; ready/handoff sequence. |
| C8 recovery | Anonymous tracking denied, generic non-enumerating response, GET does not consume link, actual exchange, fresh-context replay rejection. |
| C9 email failure | Exhausted delivery shown in admin while customer tracking remains usable; outbox tests cover retries/leases. |
| C10 changed terms | Proposal pauses instructions; explicit customer acceptance resumes them. Integration covers receipt invalidation of a pending proposal. |
| C11/C12 cancellation | Recovery/private tracking, deliberate owner cancellation, cancelled state and no invented refund for an unpaid zero-receipt order. |
| Account | Real sign-up, unverified sign-in rejection, local SMTP verification-link redemption, wrong-password retry, successful sign-in, customer denied admin, failed sign-out retry and successful sign-out. |

## Merchant/admin journeys

| Journey | Executable evidence |
| --- | --- |
| M1 protected setup | All setup dispatches and malformed inputs tested; profile settings persist; store verification email sent to local sink, valid link consumed, replay rejected; missing/invalid tokens rejected. Bootstrap dispatch and owner-recovery authorization boundaries also have unit coverage. |
| M2 catalog | Create product, add variants, publish, translated title, variant selection, availability, categories; empty names/SKUs and malformed prices rejected. |
| M3 CSV | Invalid preview, choose a different file, actual valid import, product/order CSV download contents. Test creates its own order. API/unit tests cover auth, malformed CSV and duplicates. |
| M4 staff | Successful sign-in, owner-only customer export, staff revocation applied to next private request, anonymous packing-slip/export rejection, customer denied admin. |
| M5 owner | Last-owner removal rejected; recovery boundary unit tests and documented operator recovery remain separate from browser account login. |
| M6 pause | Pause/resume controls; a previously reviewed checkout is rejected while paused, with no order created. |
| A1 queue | Unpaid, evidence, fulfillment/payment, payout and failed-email sections used by actual workflows; mobile overflow and Axe checks. |
| A2 receipts | Partial receipt cannot confirm; exact payment confirms; duplicate receiving references covered at database/request layers; account verification required; malformed amounts rejected. |
| A3 fulfillment | Pickup readiness then verified handoff, rejection of premature handoff, shipping completion, authenticated packing slip with actual address and print-button activation. |
| A4 correction | Actual tracking/carrier correction with database assertion. This historical audit predates the follow-up pickup/delivery rescheduling controls under /admin/fulfillment/shipments; see generic-store-validation.md for current evidence. |
| A5 refund/cancel | Partial purchase refund keeps fulfillment active; paid cancellation creates refund work; preconfirmation/cancelled purchase refunds and cross-order receipts rejected server-side. |
| A6 payout | Claim with destination, reconcile real synthetic amount, assert settlement and order status. |
| A7 surplus/late | Overpayment blocks confirmation; return is accessible before confirmation; claim-limit discrepancy blocks confirmation until reviewed resolution; settled excess then permits confirmation. Cancelled orders accept late receipt and owner-authorized late return without reopening. Canonical corrected capacity and receipt ownership have regression tests. |
| A8 discrepancies | Wrong destination creates hold, reviewed resolution; close unused attempt; order-lock serialization verified in PostgreSQL for all four payout mutations. |
| A9 receipt correction | Cash tender/change values asserted, signed correction and investigation submitted, stored correction checked. Broader investigation lifecycle is not represented by the current simple form. |
| A10 abandoned | Owner cancellation without receipts creates no full-price refund obligation. |

Browser sources: `tests/browser/cuj.spec.ts`, `boundaries.spec.ts`, `m1.spec.ts`, `request-rejections.spec.ts`. Every test contains state assertions, not just clicks.

## Request inventory

`tests/unit/server-actions.test.ts` compares exported server actions with its case inventory, so adding an unmapped export fails the suite. All 36 current exports are mapped. Tests assert parsed command payloads, trusted identity, redirect/error behavior and rejection before mutation.

| Area | Server actions |
| --- | --- |
| Cart/order | addItem, changeItem, quoteCart, placeOrder, recoverOrder, exchangeLink, acceptProposal |
| Setup/catalog | setupOwner, saveSettings, saveShipping, savePickup, savePayment, togglePause, saveProduct, toggleAvailability, saveCategory, sendVerification, verifyEmail |
| Order operations | proposeChange, receivePayment, confirmPayment, fulfillConfirmedOrder, markOrderReady, completeOrderPickup, cancelAdminOrder, authorizeOrderRefund, authorizeOrderSurplusReturn, receiveCashPayment, correctRecordedReceipt, correctOrderFulfillment |
| Payout/staff | claimOrderPayout, reconcileOrderPayout, resolveOrderPayoutDiscrepancy, closeOrderPayoutAttempt, updateStaffMember, removeStaffMember |

Client helper coverage covers authentication, sign-out, all three evidence stages, CSV import and CSV export, including HTTP errors, non-JSON responses, invalid success payloads and network interruption. Dedicated route tests cover public assets, evidence creation/upload/viewing, CSV imports/exports, auth delegation, owner recovery and health endpoints.

## Defects fixed by this work

- Strict integer, boolean, identifier and required-text validation instead of permissive conversions or silent empty-input handling.
- Unique field IDs across repeated admin forms and accessible staff-access select names.
- Authenticated packing slips, correct shipping-address snapshot rendering, and a client-side print handler.
- Owner-only order/customer exports.
- Bounded evidence request bodies with early MIME/size/ID rejection and sanitized errors.
- Preconfirmation surplus/late-payment operations made reachable; purchase refunds restricted to confirmed/completed purchases and their own receipts.
- Confirmation uses corrected receipts and settled nonpurchase returns, freezes the remaining actual funding, and blocks unresolved payout holds.
- Surplus authorization checks corrected per-receipt and order-wide excess rather than allowing purchase funds to be returned as surplus.
- Payout mutations share the owning-order lock with confirmation and surplus calculations.
- Isolated browser/integration runners, failure propagation, independent fixtures and CI coverage gates.

## Limits and remaining release evidence

This is not a claim that every possible combination or the entire intended first-release specification is complete. Automated browser execution uses Chromium; mobile checks use a 360px viewport. Axe and Enter/Space activation do not establish screen-reader usability, full Tab traversal/focus recovery, touch-device behavior or Firefox/WebKit compatibility. Those require separate release checks.

At the time of this audit the frontend exposed tracking/carrier correction; the 2026-10-06 follow-up adds staff pickup/delivery rescheduling with integration coverage. This older browser audit does not certify that new UI. Its A9 receipt-correction form does not implement the full reviewed-case hold/dismiss lifecycle described in the broader specification. M5 operator recovery and O1/O2 install/restore rehearsals are separate operational workflows; this audit does not certify them through browser tests. Local SMTP/storage fixtures verify application requests, not production provider permissions, inbox deliverability or external money movement.

Keep these distinctions when reporting coverage: passing request tests and a mapped CUJ are evidence for the listed assertions, not proof of all intended subcases.

## Review outcome

Standards review: no remaining actionable defects in the scoped fixes. The review identified payout-lock races and preconfirmation purchase-refund exposure; both were reproduced, fixed and tested.

Spec/coverage review: fixture dependence and bypassed email verification were fixed. The report distinguishes automated assertions from intended features and manual release evidence. No claim of exhaustive state-space coverage is made.
