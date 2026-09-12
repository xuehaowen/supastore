# Customer and Admin End-to-End Validation Plan

## Implementation status

Completed in this pass:

- Added strict action parsing for IDs, integers, enums, booleans, and required text.
- Rejected unknown fulfillment values instead of silently treating them as shipping.
- Added direct validation tests for shared request helpers and admin commands.
- Wired admin fulfillment, pickup-ready, pickup-handoff, cancellation, refund authorization, and surplus-return controls.
- Wired payout claim, reconciliation, discrepancy resolution, and payout-attempt closure controls.
- Wired owner-managed staff role/active-state changes and membership removal controls.
- Added browser-level rejection scenarios for invalid customer quantities and premature pickup handoff.
- Added `test:browser` and `test:all` commands plus CI jobs for unit, coverage, build, PostgreSQL integration, and browser validation.
- PostgreSQL integration suite currently passes: 20 tests across four files.
- Seeded Chromium browser suite passes: 8 tests covering customer checkout/recovery/accessibility, admin pause/catalog, and customer/admin rejection journeys.
- Enforced owner-only cancellation/refund authorization.
- Removed mock tracking defaults and require an explicit carrier/manual-delivery method.
- Required pickup readiness and a supported verification method before handoff.

Still required before the plan is complete:

- Add browser coverage for receipt corrections, cash receipts, payout claims/reconciliation/discrepancies, staff governance, and fulfillment corrections/rescheduling; these admin journeys remain unexecuted in the browser suite.
- Add direct server-action tests for every exported action and browser coverage for all C/A journey rows.
- Add database/storage race tests and make browser/integration suites mandatory CI gates.

## Objective

Ensure every customer and admin interaction accepts only valid requests, rejects malformed/unauthorized/stale requests with stable user-facing messages, and is covered by automated tests from request boundary through persisted state and rendered UI.

The authoritative acceptance matrix is `docs/critical-user-journeys.md` (C1–C12 and A1–A10). Financial and concurrency expectations remain governed by `docs/business-workflows.md` and `docs/transaction-contracts.md`.

## Current baseline

- `npm.cmd run typecheck` passes.
- `npm.cmd test` passes 136 unit/e2e tests.
- Browser tests exist but are separate from the default test command and cover only a subset of C1–C10/M1–M2.
- `src/app/actions.ts` has no direct contract tests.
- Several implemented use cases have no admin action or rendered control: fulfillment, pickup handoff, fulfillment correction, cancellation, refund/return, payout settlement, receipt correction, cash receipts, and staff management.

## Definition of done

For each customer/admin interaction:

1. The UI presents the action, loading state, success state, empty state, and readable error state.
2. The server boundary validates every externally supplied field, enum, identifier, numeric limit, ownership/session, role, origin, and request identity.
3. The use case revalidates authorization and business invariants inside the transaction; UI validation is never the sole control.
4. Invalid, unauthorized, stale, duplicate, conflicting, and retry requests are tested for both response/message and unchanged state.
5. A browser test exercises the successful interaction and the important user-visible failures.
6. CI runs typecheck, unit/contract tests, integration tests, and browser tests against isolated seeded data.
7. Coverage is traceable to C1–C12 and A1–A10; no journey is marked complete without an automated test or an explicitly documented out-of-scope reason.

## Dependency graph

```text
Inventory and contracts
        |
        v
Request-boundary validation + shared error contract
        |
        +--> Customer browser journeys
        |
        +--> Admin workflow actions and screens
                     |
                     v
          Admin browser journeys and race tests
                     |
                     v
               CI/release coverage gate
```

## Workstream 1 — Build the interaction inventory and contract matrix

Context: use `docs/critical-user-journeys.md`, `src/app/actions.ts`, all API routes, all rendered forms/buttons, and all application use cases. Treat every form action, client `fetch`, link that changes state, and admin operation as an interaction.

Tasks:

- Create a matrix with columns: journey ID, actor, UI entry point, action/route, valid inputs, invalid inputs, authorization rule, state transition, success message, error message, unit test, integration test, browser test.
- Enumerate customer interactions: browse/search/filter, add/update/remove cart, quote shipping/pickup, place order, retry order, recovery request/exchange, proposal acceptance, evidence upload/retry, account sign-in/sign-up/sign-out, language switching.
- Enumerate admin interactions: setup/bootstrap, settings, shipping/pickup, payment accounts, pause/resume, products/categories/availability, import/export, receipt recording, confirmation, proposal, fulfillment, corrections, cancellation, refund/return, payout claim/reconcile/resolve, staff governance, email verification/recovery.
- Mark every missing UI/action path separately from every missing test. Missing functionality must not be hidden by a test-only workaround.

Verification:

- Every exported server action, API route, and use-case operation appears exactly once in the matrix.
- Every C1–C12 and A1–A10 row maps to at least one concrete test scenario.

Exit criteria: reviewed matrix committed under `docs/` or `plans/`, with explicit owners for missing interaction paths.

## Workstream 2 — Standardize request validation and error behavior

Context: server actions currently convert `FormData` values with generic `String`/`Number` coercion, and `perform` converts errors into query-string messages. Establish one predictable contract before adding broad tests.

Tasks:

- Add shared schemas/helpers for UUIDs, non-empty bounded text, email, locale, fulfillment type, dates/times, quantities, money minor units, currency precision, country codes, IDs, and allowed enum values.
- Reject invalid enum values instead of silently defaulting; in particular, `quoteCart` must reject an unknown fulfillment type rather than treating it as shipping.
- Reject `NaN`, infinity, fractional, negative, over-limit, and missing numeric values before entering a use case.
- Validate that required hidden fields are present and correctly typed; never rely on browser `required`, `min`, or `max` attributes.
- Define stable error categories/messages for validation, unauthorized, forbidden, not found, conflict/stale request, invariant violation, rate limit, and unexpected failure.
- Preserve generic responses where required for privacy, especially recovery requests and cross-order access.
- Ensure redirects never expose raw database/provider errors or sensitive identifiers.
- Add request IDs/idempotency keys where workflows require safe retry and assert duplicate behavior.

Tests:

- Directly test every exported action in `src/app/actions.ts` with valid, malformed, unauthorized, forbidden, stale, and duplicate `FormData`.
- Test every API route for origin, authentication, role, content type, body/schema, resource ownership, rate limiting, and unexpected dependency failure.
- Assert both error message/category and that the use case/database/storage was not called for rejected input.

Exit criteria: all request boundaries have schema tests and a shared error contract; no action silently coerces an invalid request into a different valid operation.

## Workstream 3 — Complete customer interaction coverage (C1–C12)

Context: retain guest privacy and scoped order access. Customer browser tests should use isolated browser contexts and seeded fixtures, not inspect database state as a substitute for visible behavior.

Scenarios:

- C1/C2: search/filter/no results, unavailable or missing-image product, add/update/remove, zero/negative/fractional/huge quantity, expired cart, back/refresh/language retention.
- C3: valid shipping and pickup quotes; unsupported country, invalid address, closed/blackout/past/preparation-window pickup, incompatible cart, changed price/availability, invalid payment account.
- C4/C5: accepted quote creates one order; missing acceptance, bad quote ownership, expired quote, double submit, same-key retry, and retry after network interruption do not create duplicates or reveal payment instructions early.
- C6: valid image upload; empty/wrong MIME/oversize/bad signature, interrupted PUT, stale intent, overwritten object, repeated finalize, and upload to another order are rejected with readable messages.
- C7: zero-total order confirms only with valid fulfillment and no payment evidence.
- C8/C9: generic recovery response for found/not-found orders, invalid/expired/reused token, wrong email/reference, valid scoped session after email failure, and no cross-order disclosure.
- C10: proposal visible only to scoped order, explicit acceptance required, stale proposal rejected, receipt-first race preserves accepted terms.
- C11/C12: support/cancellation explanation is visible; accepted unavailable purchase remains trackable and does not silently change price/items.
- Account interactions: invalid credentials, unverified email, duplicate registration, weak/oversized values, sign-out failure, and session isolation.

Exit criteria: browser coverage maps to every C row, with at least one success and one meaningful rejection per stateful interaction.

## Workstream 4 — Add missing admin actions and UI, then test A1–A10

Context: the current queue renders confirmed orders but does not expose the fulfillment/refund/correction operations implemented in application code. Add thin server actions and forms that call existing use cases; do not duplicate business rules in React components.

Required interaction groups:

- A1: queue filters/sections for unpaid, evidence review, preparing/ready, overdue, payout-pending, discrepancies, correction holds, and failed email delivery.
- A2: transfer and cash receipt recording with explicit account/amount/reference verification, underpayment/excess handling, duplicate retry behavior, and exact-payment confirmation.
- A3: print packing slip, ship/manual delivery with carrier/tracking validation, mark pickup ready, complete pickup handoff with scoped-page or owner-assisted verification, and reject contact/order-number-only handoff.
- A4: same-cost address/tracking correction and pickup reschedule with reason, notice/availability revalidation, audit, and notification; reject post-payment cost changes.
- A5–A8: cancellation versus refund screen, purchased-component limits, original-source destination verification, payout claim/claim lock, partial settlement, uncertain attempt, wrong-destination/excess discrepancy, hold release, and late evidence.
- A9: receipt correction review, dismissal, duplicate void, amount delta, cross-order duplicate handling, funding-loss display, and wrong-account investigation hold.
- A10: overdue unpaid review and deliberate cancellation; no refund of unreceived requested totals.
- M4/M5: staff add/change/remove with owner-only controls, last-owner guard, immediate revocation, and owner recovery.

Tests:

- Add action-level tests for every new admin action.
- Add integration tests for each state transition and the documented lock/race cases.
- Add browser tests that verify controls are hidden/disabled for the wrong role and that successful actions update the queue and customer order page.

Exit criteria: every A1–A10 row has a reachable admin UI path, server action, integration test, and browser test; existing use cases are either wired or explicitly removed as out of scope.

## Workstream 5 — Stateful integration and adversarial testing

Tasks:

- Run each workflow against isolated PostgreSQL and storage fixtures.
- For every state-changing request, test replay, concurrent duplicate, stale revision, wrong actor, wrong order, wrong role, revoked staff, and dependency failure.
- Assert atomicity: no partial order, fulfillment, audit, outbox, receipt, authorization, payout, or upload-intent records after a rejected/failed transaction.
- Add property/table-driven tests for quantities, money boundaries, dates/timezones, CSV rows, and malformed identifiers.
- Add storage-grant tests proving a guest can access only their scoped evidence/order and staff can access only authorized admin resources.
- Verify outbox/email failures leave tracking and operational recovery available.

Exit criteria: all documented race cases in the transaction contracts and journey matrix pass against a real database; rejected requests leave state unchanged.

## Workstream 6 — Browser quality and CI gates

Tasks:

- Split browser specs by customer, admin setup/catalog, admin order operations, recovery, and accessibility.
- Add reusable fixtures for owner, staff, revoked staff, customer, guest order, unpaid/confirmed/cancelled/held orders, and failed email.
- Assert loading/disabled states, focus placement, screen-reader labels, mobile queue usability, empty states, and stable error text.
- Make browser tests fail on console errors, unexpected 5xx responses, duplicate network submissions, and uncaught promise rejections.
- Update scripts so CI runs: typecheck, unit/action/API tests, PostgreSQL integration tests, default e2e, browser tests, and coverage thresholds.
- Publish a journey-to-test report in CI; fail if a C/A journey has no passing test reference.

Suggested commands:

```text
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:coverage
```

Exit criteria: a clean checkout runs the full suite with isolated fixtures, and CI prevents merging uncovered customer/admin interactions or unvalidated request paths.

## Recommended execution order

1. Workstream 1: inventory and contract matrix.
2. Workstream 2: shared validation/error contract and action/API tests.
3. Workstream 3: customer browser coverage (parallel with Workstream 4 after Workstream 2).
4. Workstream 4: missing admin UI/actions and admin browser coverage.
5. Workstream 5: database/storage races and atomicity (parallel with browser work where fixtures are independent).
6. Workstream 6: CI gates, accessibility, and final traceability report.

## Adversarial review gate

Before calling the plan complete, review the implementation against these questions:

- Can a crafted `FormData` value bypass a browser constraint or select a different operation?
- Does every state-changing request re-check actor, ownership, role, revision, and current lifecycle inside the transaction?
- Does every rejected request leave all durable state unchanged?
- Are privacy-sensitive failures generic enough to prevent order/account enumeration?
- Are retry, timeout, duplicate, and concurrent requests covered for every money/fulfillment/evidence operation?
- Does every implemented use case have a reachable UI path, or is it intentionally excluded and documented?
- Do browser tests prove user-visible messages rather than only HTTP status or database rows?
- Can the complete suite run deterministically from a clean checkout?
