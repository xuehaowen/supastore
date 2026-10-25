# Storefront redesign

The customer storefront uses a warm editorial system: cream surfaces, forest-green
type, Georgia headings, consistent 8px controls and 12px image corners. Responsive
containers stop at 1440px with 20/32/64px gutters. Backend component defaults remain
unchanged.

## Shopping experience

- Desktop navigation and a lazy-loaded mobile Sheet include search, account,
  language selection and the live bag count. Checkout uses a compact header.
- Homepage photography and bilingual copy are merchant-selected. Stores without
  hero settings retain a compact text introduction. Filtered searches never
  choose the hero image.
- Catalog/search/category/collection pages share product grids, filter controls,
  pagination and empty states. Filter controls remount from the current URL.
- Product pages prioritize title, price, options and purchase. Galleries, policy
  links, details and specifications remain available. Missing images use neutral
  placeholders.
- Add to bag retains product selections, returns visible confirmation or an
  inline error, and updates the bag count without a cart redirect. Private reads
  forward the current Next cookie store, including cookies just set by an action.
- Cart rows include thumbnails. Checkout keeps the existing quote, fulfillment,
  review, consent, credit and payment flow with a mobile order-summary disclosure.
- Account authentication uses Base UI Tabs; recovery tools use an Accordion.
  Orders, policies, SMS, recovery and error pages share the storefront styling.

Interactive primitives live in `@supastore/ui`. Menu/filter Sheets and contextual
commerce previews load on demand. Native details/summary provide simple product
and mobile-summary disclosures without adding JavaScript. Loading skeletons are
restricted to search so missing product routes retain HTTP 404 responses.

## Homepage settings and asset ownership

Migration `0046_storefront_hero` adds nullable JSON settings, defaulting to null.
Owner-only **Store setup → Storefront homepage** edits English/Chinese headings
(120 characters), introductions (300) and image descriptions (180). Blank fields
fall back to the store's default language, then available translated content.

The bounded image picker searches uploaded photography belonging to published
products or collections. It retains the current selection when a search excludes
it. Arbitrary/private asset keys are rejected. A selected hero is an independent
public reference: removing its catalog reference does not delete its photograph.
Cleanup and hero replacement serialize on the store lock; replacing/clearing the
hero schedules its former upload for cleanup when no references remain.

The synthetic seed bundles three licensed photographs. Their sources and license
are recorded in [the imagery manifest](../scripts/seed-data/images/SOURCES.md).
Configured stores use merchant assets; runtime pages do not substitute demo images.

## Review and validation

- TypeScript and ESLint checks pass. Code and TypeScript reviews resolved the
  account layout, asset lifetime, URL-state, cookie-refresh and reduced-motion
  findings.
- The unit/library suite passes 1,345 tests. A fresh isolated PostgreSQL cluster
  passes all 195 integration tests, including hero authorization, validation and
  image retention/cleanup.
- The initial retained integration database correctly failed deployment-readiness
  because its historical migration 0044 hash differs from this checkout. Its
  journal was not rewritten; the clean-cluster run validates this release.
- All 73 browser scenarios are verified: 70 passed in the full run, and three
  updated design assertions passed in targeted follow-ups. These cover
  English/Chinese layouts at 375/768/1440px, private cookies, repeated additions,
  checkout, contextual pricing, account emails and HTTP 404 behavior.
- The complete page audit covers 119 screens across 47 backend and 19 storefront
  page sources, with no serious or critical axe violations. The Sheet keyboard,
  focus restoration and reduced-motion check passes five consecutive repetitions.

The production build passes the unchanged bundle budgets (maximum 10% growth
against the existing baseline, and 200 KiB gzip per route):

| Route    | Gzip JavaScript |
| -------- | --------------: |
| Homepage |       168.6 KiB |
| Product  |       171.5 KiB |
| Bag      |       165.4 KiB |
| Checkout |       171.5 KiB |

The [bundle report](benchmarks/2026-10-21-storefront-redesign-bundles.json)
records the measurements. Browser tests start the real background worker alongside
the isolated database, SMTP sink and storage fixture so queued account emails are
delivered. Store-credit journeys use a verified customer separate from staff,
matching the existing directory rules.

Screenshots: [desktop homepage](images/redesign-home-desktop.png),
[mobile product](images/redesign-product-mobile.png), and
[mobile checkout](images/redesign-checkout-mobile.png).

No deployment or configured-store migration is performed by this work.
