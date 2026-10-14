# Separate customer storefront

Independent Next.js customer app using backend APIs and same-origin proxying.

## When working here

Backend URL affects compiled rewrites and runtime traffic. The original customer page tree is the canonical customer surface. All runtime data access uses backend HTTP APIs; backend model imports in `lib/page-data.ts` are type-only and erased from the bundle.

## Where to start

- [next.config.mjs](next.config.mjs): Build-time proxy/rewrite configuration.

- [middleware.ts](middleware.ts): Sets locale context for incoming page requests.
- [Storefront pages and proxy route](app/README.md): Localized shopping/account/order pages, client interactions, recovery, SEO and API proxy entry point.
- [Storefront HTTP and display helpers](lib/README.md): API/client calls, streaming backend proxy, trusted-edge IP handling, locale, money, SEO and analytics.

## More context

[Parent overview](../README.md) · [Deployment guide](../../docs/two-service-deployment.md)
