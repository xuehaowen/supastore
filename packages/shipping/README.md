# Shared shipping helpers

Country/state options, destination field requirements, region validation, and enabled fulfillment choices shared by backend and storefront.

## When working here

Keep customer destination fields aligned with backend validation. Zone matching and shipping pricing live in the backend [checkout rules](../../apps/backend/src/domain/checkout.ts); this package determines available choices and required fields.

## Where to start

- [destination.ts](src/destination.ts): Country/state names, region validation, required region/postal fields, and available fulfillment methods.

## More context

[Parent overview](../README.md)
