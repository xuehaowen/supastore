# Storefront discovery and JavaScript budgets

October 17, 2026: Step 4 adds enforceable shopping-route budgets and merchant-aware public metadata. This is local synthetic verification; production domain, mobile network and target host acceptance remain open.

## Four-route budget gate

`pnpm bench:storefront` reads the production storefront build. Set `STOREFRONT_DIST_DIR` to a directory relative to `apps/storefront` when using an isolated build. CI runs the check after building the storefront.

The metric sums the gzip size of each unique JavaScript chunk required by the route, root/localized layouts and root/localized error boundaries. It is compiled route JavaScript, not browser network transfer, RSC payload, images or a measurement of every lazy chunk. The manifest and files must exist; malformed manifests, missing routes/chunks and paths escaping the build directory fail the check.

The versioned policy is [storefront-budgets.json](../scripts/storefront-budgets.json). Baselines were measured from clean `022f92f4bb8abe12c8e8200f148d5a3c2525ee3d`. Each route must stay at or below 200 KiB gzip and at or below 10% growth from its frozen baseline. This measurement includes the localized error boundary: 648 gzip bytes omitted by the previous warning script. The methodology change is included in the baseline.

| Route    | Baseline gzip bytes | Current gzip bytes | Current KiB | Result |
| -------- | ------------------: | -----------------: | ----------: | ------ |
| Catalog  |             160,484 |            160,484 |       156.7 | Pass   |
| Product  |             161,908 |            161,909 |       158.1 | Pass   |
| Cart     |             159,117 |            159,117 |       155.4 | Pass   |
| Checkout |             165,130 |            165,149 |       161.3 | Pass   |

All four routes currently include 17 unique chunks. Values are from a fresh production fixture build at application commit `045efd6`; small compression differences do not establish a runtime performance change. [Machine-readable result](benchmarks/2026-10-17-storefront-budgets.json).

The CLI emits JSON and exits 0 for pass, 2 for budget violations, and 1 when valid measurement evidence cannot be obtained. Regression tests cover both budget limits, deduplication, missing evidence, path escapes and an actual over-budget CLI process. Updating a baseline requires an explicit policy change; the CLI has no threshold override.

## Public discovery behavior

- Catalog, product, category, collection and policy pages use the configured store name. Descriptions use existing public content where available. Canonical URLs and language alternates use `STOREFRONT_ORIGIN`.
- Catalog, category and collection pagination retain their own page canonical. The homepage now passes query parameters to its catalog read, so page 2 renders page 2 as well as declaring its canonical. This follows [Google's pagination guidance](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading).
- Search and filtered listings declare `noindex, follow`; private shopping/account/recovery routes retain noindex behavior.
- Policy metadata follows the same localized/default content fallback as the visible page. Sitemap alternates include only resolving locales; a Chinese-only policy points `x-default` to its Chinese URL.
- Robots rules permit `/api/assets` inside the broader `/api/` exclusion so published product images can be crawled. The backend still authorizes image access: unpublishing a product removes its image access and sitemap listing. Robots rules do not grant access.
- Product structured data remains present. Browser acceptance checks compare its name with the visible heading and verify a zero-price offer. This is not a complete audit of every inventory or offer combination.
- Metadata/render reads share a React request-scoped response. This introduces no persistent customer cache. Existing cookie isolation, uncached private reads and bounded anonymous catalog caching remain in place.

## Business-information privacy

Publish business details only with merchant approval; private operational information must not be reused for search metadata. No pickup/street address, opening hours, phone number or location-specific business markup is added by this change. No LocalBusiness structured data is emitted, and local rich-result eligibility is not claimed. Existing pickup operations are unaffected. [Google's LocalBusiness documentation](https://developers.google.com/search/docs/appearance/structured-data/local-business) is the reference for a future merchant-approved implementation.

## Acceptance and remaining work

The full unit/library suite passes 1,159 tests. Root, backend and storefront type checks, repository ESLint and full formatting pass. Focused coverage of the new bundle/metadata/origin helpers is 94.36% statements, 94.80% branches, 100% functions and 95.52% lines. All 36 production browser tests pass, covering merchant titles/descriptions, locale links, page canonicals, noindex, Product JSON-LD, sitemap shards, unpublished products and public-image authorization, alongside the existing shopping journeys. Disposable services shut down cleanly. Independent review found no confirmed issues.

Before launch, set and verify the real HTTPS storefront origin, inspect deployed robots/sitemap/canonicals, submit the sitemap in Search Console, and check actual mobile loading and checkout on the target host. Search ranking and rich-result appearance are not guaranteed by metadata changes. PostgreSQL memory accounting/stability and the compact-runtime throughput tradeoff remain open in [memory diagnosis](memory-diagnosis.md); Step 4 and deployment readiness are not complete.
