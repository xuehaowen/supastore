# Storefront pages and proxy route

Localized shopping/account/order pages, client interactions, recovery, SEO and API proxy entry point.

## When working here

Use lib clients/proxy helpers. This tree owns the original customer interface, including category, collection, content and search pages.

## Where to start

- [catalog.tsx](catalog.tsx), [product-purchase.tsx](product-purchase.tsx), and [checkout-forms.tsx](checkout-forms.tsx): Original shopping and checkout UI.
- [customer-auth.tsx](customer-auth.tsx) and [address-book.tsx](address-book.tsx): Account, authentication, profile and address interactions.
- [actions.ts](actions.ts), [customer-actions.ts](customer-actions.ts), and [return-actions.ts](return-actions.ts): Server actions backed by HTTP APIs; private cookies are relayed through `lib/server-request.ts`.

## More context

[Parent overview](../README.md) · [Deployment guide](../../../docs/two-service-deployment.md)
