# Backend source

The backend Next.js application, business workflows, pure calculations, and backend integrations live here.

## When working here

Start with app for entry points, application for behavior, domain for calculations, and infrastructure for external effects.

## Where to start

- [instrumentation.ts](instrumentation.ts): Starts backend background work and registers shutdown handlers.
- [middleware.ts](middleware.ts): Sets locale context for incoming page requests.
- [Application routes and UI](app/README.md): Merchant admin, server actions, and backend HTTP routes. Customer pages live in the storefront app.
- [Application behavior](application/README.md): Coordinates authorized business operations, database transactions, audit/events, and provider-neutral policies.
- [Pure business rules](domain/README.md): Checkout, money, rewards, reporting, destination, shipment and financial-projection calculations.
- [Backend integrations](infrastructure/README.md): Database, authentication, storage, providers, HTTP security, workers and runtime setup.
- [Shared UI components](../../../packages/ui/README.md): Reusable presentation primitives.
- [Shared localization](../../../packages/i18n/README.md): Locale dictionaries, request context and customer copy.

## More context

[Parent overview](../README.md)
