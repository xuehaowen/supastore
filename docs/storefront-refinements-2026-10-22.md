# Storefront refinements

The editorial storefront now supports more deliberate merchandising and easier
photograph discovery while preserving the existing commerce flows.

- **Photography:** the isolated synthetic demo uses a dedicated morning-light
  lifestyle hero and a second cup photograph. The source is documented in the
  [imagery manifest](../scripts/seed-data/images/SOURCES.md). Configured stores
  continue to use merchant uploads.
- **Merchandising:** owners choose up to three published collections and six
  published products, then move them into display order. Selected collections
  introduce the homepage catalog. Selected products lead its default ordering;
  pagination stays consistent, and searches, filters and explicit price sorting
  retain their normal behavior. Unpublished items never enter public results.
- **Owner preview:** Store setup → Storefront homepage previews unsaved hero copy,
  photography and collection links in English or Chinese at 375px and 1440px.
  Top, center and bottom crop controls apply to the live hero after saving. The
  preview is scaled to fit the settings panel and remains script-disabled.
- **Discovery:** cards with two photographs support mouse hover, native touch
  scrolling and keyboard-accessible position buttons. Product pages support swipe,
  previous/next controls, position announcements and the existing thumbnails.
  Variant changes still select the corresponding product photograph.
- **Mobile rhythm:** smaller product/checkout bottom spacing and footer gaps
  reduce empty scrolling while preserving control sizes and the desktop layout.

Optional merchandising and crop fields extend the existing nullable hero JSON;
no additional migration is required. Owner authorization, UUID/limit/duplicate
checks and published-item validation apply on the server. The synthetic demo seeds
two bilingual collections only when creating its initial homepage settings.

## Validation

The unit/library suite passes 1,347 tests and the isolated integration suite passes
196 tests. TypeScript and ESLint checks pass. Code review approved the contract,
SQL ordering, preview isolation and gallery changes. The actual draft document is
audited in a separate test page because its production iframe disables scripts,
including the accessibility scanner's cross-frame agent.

All 75 browser scenarios are verified: 73 passed in the broad run and both new
scenarios passed in follow-ups. The final gallery build also passes all nine
targeted discovery, preview, loading-feedback and bilingual layout tests. The
119-screen audit records no serious or critical accessibility violations.

The unchanged JavaScript budgets pass: homepage 169.0 KiB, product 171.9 KiB,
bag 165.4 KiB and checkout 171.5 KiB gzip. Measurements are recorded in the
[bundle report](benchmarks/2026-10-22-storefront-refinement-bundles.json).

Screenshots: [desktop homepage](images/redesign-home-desktop.png),
[mobile product](images/redesign-product-mobile.png),
[mobile checkout](images/redesign-checkout-mobile.png), and
[owner draft preview](images/refinement-owner-preview.png).

No deployment or configured-store migration is performed.
