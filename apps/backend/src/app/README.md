# Application routes and UI

Merchant admin, server actions, and backend HTTP routes. Customer pages live in `apps/storefront/app`.

## When working here

Keep routes thin: parse inputs and establish identity, then call application use cases. The separate customer interface lives in apps/storefront.

## Where to start

- [actions.ts](actions.ts): Compatibility exports for feature-specific server actions in [actions](actions/README.md).
- [interactive.tsx](interactive.tsx) and [client-requests.ts](client-requests.ts): Admin sign-in, product variants and CSV requests.
- [return-actions.ts](return-actions.ts): Merchant return review and receipt actions.

- [Merchant administration](admin/README.md): Authenticated merchant screens and actions for setup, catalog, orders, payments, inventory, fulfillment, returns, reports, and notifications.
- [Backend HTTP endpoints](api/README.md): Commerce, authentication, evidence, assets, health, and signed provider callback routes.

## Related paths and checks

- Customer route families are owned by `apps/storefront/app`; their data loaders live behind `/api/v1/customer-pages/[page]`.
- Checks: browser `cuj.spec.ts`, `i18n.spec.ts`, `boundaries.spec.ts`; unit `frontend-requests.test.ts`.
- Customer pages use accepted backend behavior. Public catalog caching never authorizes checkout prices; customer language does not change currency.

## More context

[Parent overview](../README.md)
