# Checkout

checkout.tsx composes customer/payment fields, fulfillment-fields.tsx, and
quote-review.tsx. use-checkout.ts owns account loading, form state, credit checks,
and HTTP requests. checkout-state.ts models editing, reviewing, ready, and placing.

Changing a form field invalidates its quote. An in-flight review cannot restore
a quote for an older form revision; duplicate submissions are suppressed. Quote
and order responses use the shared runtime validators before totals are shown or
the browser navigates. Prices and consent remain authoritative in backend use cases.
