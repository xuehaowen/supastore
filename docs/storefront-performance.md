# Storefront latency review

The October 16, 2026 review used production builds with isolated synthetic PostgreSQL, storage and mail services. It did not reproduce a multi-second delay locally. Development compilation, deployment network distance, real catalog size and production database load remain unmeasured.

## Changes

- Common English/Chinese catalog page reads use the existing 30-second public fetch cache without forwarding customer cookies. Search, category, sort and option combinations stay uncached to bound cache growth.
- Product availability, cart, checkout, account and session reads remain uncached. Catalog presentation uses a 30-second revalidation interval and may briefly lag an admin update; current product and checkout validation remain authoritative.
- Independent catalog, product and layout database reads run concurrently. Translation and stock dependencies retain their required ordering.
- Product metadata and rendering share one live product response within a React server-render request, rather than persisting stock across requests.
- Cart and recovery actions invalidate their destination page instead of the root layout. Authentication actions retain their existing layout refresh.
- Search/filter submission uses Next.js Form navigation, preserving the document. Header and product-card links show a progress indicator during navigation; add-to-cart shows a pending label and disables duplicate submission. Reduced-motion preferences are respected.

## Verification

The cache regression was reproduced before implementation: eight assertions failed because common catalog reads were uncached and public listing requests carried customer cookies. All 13 cache/privacy regression cases now pass.

The focused unit suite contains 112 passing tests. Production shopping regressions cover cart editing, English/Chinese navigation, stock/quote validation, checkout, pickup, private order access, payment confirmation and refunds. Additional browser checks deliberately hold navigation and submission responses to verify pending feedback, and verify that search preserves a window marker across navigation.

The repeatable timing harness is [storefront-performance.spec.ts](../tests/browser/storefront-performance.spec.ts). It records eight HTTP samples for each catalog, product and cart page, discards the first for the warm median, measures the backend separately, and attaches browser navigation timings. Results are diagnostic samples rather than hard timing assertions, since host load varies.

Warm full-document HTTP response medians from the baseline and final local runs:

| Page    | Before | After |
| ------- | -----: | ----: |
| Catalog |  25 ms | 15 ms |
| Product |  32 ms | 22 ms |
| Cart    |  19 ms | 13 ms |

These are separate synthetic local runs, with the services and database on the same machine. Browser/regression activity and host warm-up differ between runs. They indicate reduced request work, rather than establish a production speedup or measure image loading, full visual rendering or real network latency. All 17 shopping journeys passed; the affected search/cart journey was rerun after the final Form change, alongside the three performance/UI checks. Builds, application/root type checks, formatting and application-source lint checks also pass.

```sh
node scripts/test-browser.mjs tests/browser/storefront-performance.spec.ts
```

This command builds fresh production applications and runs against disposable synthetic services. It does not profile the deployed store or alter its database.
