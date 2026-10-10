# Application routes and UI

Customer pages, merchant admin, server actions, and backend HTTP routes.

## When working here

Keep routes thin: parse inputs and establish identity, then call application use cases. The separate customer interface lives in apps/storefront.

## Where to start

- [actions.ts](actions.ts): Compatibility exports for feature-specific server actions in [actions](actions/README.md).
- [customer-actions.ts](customer-actions.ts): Customer profile/account operations.

- [Merchant administration](admin/README.md): Authenticated merchant screens and actions for setup, catalog, orders, payments, inventory, fulfillment, returns, reports, and notifications.
- [Backend HTTP endpoints](api/README.md): Commerce, authentication, evidence, assets, health, and signed provider callback routes.

## Related paths and checks

- Main customer route families: localized products, cart, checkout, orders, account, search, categories, collections and content pages.
- Checks: browser `cuj.spec.ts`, `i18n.spec.ts`, `boundaries.spec.ts`; unit `frontend-requests.test.ts`.
- Both customer interfaces use accepted backend behavior. Public catalog caching never authorizes checkout prices; customer language does not change currency.

## More context

[Parent overview](../README.md)
