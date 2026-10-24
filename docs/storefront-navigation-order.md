# Storefront collection and category order

Owners can change **Storefront order** in **Admin → Categories** and
**Admin → Collections**. Enter a whole number from 0 to 1,000,000 and select
**Save order** on that row. Lower numbers appear first. Leaving gaps, such as
10, 20 and 30, makes it easier to insert another item later. Equal positions
use the category or collection handle as a stable tie-breaker.

Category positions apply among siblings. The storefront displays each parent
with its nested children before moving to the next parent. Translated names do
not change that sequence. Existing parent-editing controls continue to manage
the hierarchy; an order change does not move an item to another parent.

Homepage featured collections retain their separate selection and order in
Storefront settings. Other collection links use the saved order. **View all
collections** opens `/en/collections` or `/zh/collections`, showing every
published collection in pages of 24. Draft collections are excluded. Positions
in the directory use the same order across languages.

Only owners can save positions. Each change is audited, and a save based on an
outdated position is rejected with a request to reload. Collection revisions
advance when their position changes, protecting other open collection editors.
Order changes do not change quote versions or payment/fulfillment rules.
The existing public catalog cache may take up to 30 seconds to refresh; the
collection directory reads current data.

## Deployment

Run the normal `pnpm db:migrate` deployment step before starting the updated
backend. Migration `0047_collection_order` adds the collection position;
`0048_collection_order_backfill` preserves existing alphabetical order. Both
are forward migrations. Rolling back application code can leave these
additive database changes in place; older code ignores the extra column.

The migrations are tested on a synthetic pre-change database and on a fresh
installation. No production database is changed as part of local verification.

## Verification

- Unit coverage checks sibling ordering, complete subtrees, stable ties,
  malformed legacy hierarchies and deep trees.
- Integration coverage checks upgrades, idempotency, owner permissions,
  numeric validation, auditing and concurrent-save rejection.
- Browser coverage saves positions through admin forms, checks both languages,
  verifies featured ordering, and browses more than 25 published collections.
- The route manifest includes the collection directory in the responsive and
  accessibility audit.

Validated locally: both production builds, TypeScript and scoped lint pass;
1,407 unit tests, 9 integration tests and 18 browser scenarios pass. The updated
audit covers 20 customer route sources and records 121 screens with no serious
or critical axe findings at mobile, tablet and desktop widths.
