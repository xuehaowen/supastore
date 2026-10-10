# Application behavior

Coordinates authorized business operations, database transactions, audit/events, and provider-neutral policies.

## When working here

Change business rules here or in pure domain functions, and keep external provider I/O outside financial transactions.

## Where to start

- [Shared workflow helpers](common/README.md): Validation, errors, guest access, request identity, rate limits, transaction types, and event emission.
- [External capability contracts](ports/README.md): Small interfaces for notification and payment providers.
- [Notification policies and templates](notifications/README.md): Published template management, rendering, consent policy, delivery processing, and callback reconciliation.
- [Business commands and queries](use-cases/README.md): The main entry point for order, catalog, customer, inventory, payment, credit, and merchant workflows.

## Related paths and checks

- Routes/actions establish identity and parse input; application use cases own authorization, transaction coordination and persistence; domain functions calculate explicit inputs.
- Database-backed use cases currently import Drizzle directly: this is a logical dependency pattern, not a fully abstract repository layer.
- Adapters implement narrow application ports. Shared packages expose serializable data/helpers, never backend business imports to storefront.

## More context

[Parent overview](../README.md)
