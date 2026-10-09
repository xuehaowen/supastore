# Storefront customer journey updates — 2026-10-09

Cancellation, amendments, rescheduling, and declining proposed changes remain support-managed. Both order pages offer a support email link with the order reference in the subject. Self-service email changes and wallet top-ups are deferred.

Implemented:

- Exact order-reference search scoped to the signed-in customer's orders, with pagination preserving the search. The separate storefront now exposes all account-history pages and links to guest order recovery.
- Available/reserved wallet credit and recent activity in the separate account interface. Checkout excludes unreconciled credit from the spendable balance.
- Saved-address selection and customer name/email prefill in separate checkout, with available credit, applied credit, and remaining external payment shown before submission. Paid carts default to a usable payment method when available; missing payment and excessive credit fail before review.
- Stripe checkout in the main storefront and payment-status refresh/polling in both storefronts. Provider review/expired/paid attempts cannot initiate another payment. Evidence uploads are hidden when a Stripe attempt exists.
- Separate-storefront return requests after fulfillment, using existing domain authorization, quantity limits, and stable request keys. Return and refund progress are displayed; a request does not imply refund approval.
- English and Chinese copy for the added journeys and localized pickup dates.

Validation includes fast/unit tests, isolated PostgreSQL integration tests, production builds, TypeScript, lint, formatting, independent source review, and isolated browser journeys. Browser wallet/search/address fixtures mock account responses; order creation, return requests, authentication, password changes/reset, and fulfillment-policy tests exercise the real synthetic backend. Registration verification is enabled with synthetic fixture verification; live email delivery and live Stripe checkout were not exercised.

Results: 651 fast tests, 83 integration tests, and all 9 selected production-browser journeys passed. Both storefront production builds succeeded. TypeScript, repository lint, changed-file formatting, and independent source review passed. The initial saved-address test exposed an ambiguous selector label; the explicit accessible name resolves it.

All database/browser tests use dedicated synthetic databases. No production data, deployment, or live payment was used.
