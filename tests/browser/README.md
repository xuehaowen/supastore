# Production browser journeys

Customer/admin flows, localization, rejection and cross-service acceptance.

## When working here

Use pnpm test:browser for main journeys and pnpm test:storefront for separate services. Read fixtures before direct Playwright execution.

## Where to start

- [fixtures.ts](fixtures.ts): Shared browser fixture setup.
- [cuj.spec.ts](cuj.spec.ts): Main customer and merchant journeys.
- [cross-service-storefront.spec.ts](cross-service-storefront.spec.ts): Separate storefront/backend boundary journeys.
- [storefront-journey-updates.spec.ts](storefront-journey-updates.spec.ts): Customer account, checkout and order follow-up journeys.

Choose the runner described above before adding a test; main and cross-service suites have different setup and selections.

## More context

[Parent overview](../README.md)
