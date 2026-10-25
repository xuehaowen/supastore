# Production browser journeys

Customer/admin flows, localization, rejection and cross-service acceptance.

## When working here

Both pnpm test:browser and pnpm test:storefront run original customer journeys against the separate services. Read fixtures before direct Playwright execution.

## Where to start

- [fixtures.ts](fixtures.ts): Shared browser fixture setup.
- [cuj.spec.ts](cuj.spec.ts): Main customer and merchant journeys.
- [original-storefront-separation.spec.ts](original-storefront-separation.spec.ts): Route isolation, private cookies, original layouts and API ownership checks.
- [boundaries.spec.ts](boundaries.spec.ts) and [i18n.spec.ts](i18n.spec.ts): Original account/authentication, accessibility and translated customer journeys. Retired prototype components and their obsolete suites have been removed.
- [catalog-polish.spec.ts](catalog-polish.spec.ts), [session-isolation.spec.ts](session-isolation.spec.ts) and [admin-history-pagination.spec.ts](admin-history-pagination.spec.ts): Batch image retry, staff/customer session isolation and paginated history. These run in the default browser/CI selection.
- [error-handling.spec.ts](error-handling.spec.ts): Localized diagnostic references and rejection of untrusted references, included in the default browser/CI selection.
- [commerce-management.spec.ts](commerce-management.spec.ts) and [sms-consent.spec.ts](sms-consent.spec.ts): Mixed-credit sales/returns and optional SMS policy setup, included in the default browser/CI selection.

Choose the runner described above before adding a test; main and cross-service suites have different setup and selections.

## More context

[Parent overview](../README.md)
