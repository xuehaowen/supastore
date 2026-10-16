# Storefront and admin page polish audit

This inventory covers every checked-in Next.js page source: **44 backend routes (43 admin routes plus the root redirect) and 15 storefront routes**. Dynamic storefront policy pages cover About, Shipping, Returns and Privacy; localized routes cover English and Chinese. Route wrappers and redirects are listed, not counted as independently rendered screens.

## Reference review

- [Shopify navigation](https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview): direct section access and keyboard navigation.
- [Shopify product views](https://help.shopify.com/en/manual/products/searching-filtering): readable lists and filters.
- [WooCommerce order management](https://woocommerce.com/document/managing-orders/overview-and-bulk-management/): labelled columns, explicit actions and bulk selection.
- [Figma design systems](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties): reuse controls and component states. Figma is a design tool, not an ecommerce platform.

## Coverage and limits

Every source was inventoried for headings, layouts, forms, tables, empty states and navigation. Shared admin and storefront styles apply to rendered pages, with print and authentication surfaces treated separately. Error/not-found boundaries provide recovery paths.

Production browser inspection on October 16, 2026 checked **109 rendered screen/state variants at 1440px, 768px and 375px** using isolated synthetic data, including both languages, published policy pages, dynamic records and 19 staff views. All 327 layout checks returned usable headings with no horizontal page overflow, and the mobile scans reported zero serious/critical axe violations. This measures layout and automated accessibility coverage, not exhaustive interaction or accessibility certification. Representative screenshots were inspected for storefront, setup, orders, payments, reports, returns, inventory and catalog layouts.

The native SWC cache restriction was resolved with a dedicated protected temporary cache. Production builds and type checks pass. New route-wide loading screens were removed after browser testing exposed duplicated navigation and stale action rendering; action-level pending feedback remains.

Validation: **419 targeted unit tests pass**. The earlier 31 production browser journeys passed; this second pass additionally reran 13 admin regression journeys and the two expanded browser audits (all-page coverage and decimal report/settings persistence). Both applications build successfully; TypeScript and formatting checks pass, and changed application sources have no ESLint errors. The browser journeys cover product editing and translations, evidence zoom/receipt recording/payment confirmation, selected-order export, manual orders, pickup, refunds, staff access, setup persistence and regional shipping. The mobile product filter also closes after selection and returns focus to its disclosure control.

## Second-pass review

The repeatable audit lives in [`ui-page-audit.spec.ts`](../tests/browser/ui-page-audit.spec.ts). Its explicit [route manifest](../tests/browser/ui-route-manifest.ts) is compared with the filesystem by [`ui-page-coverage.test.ts`](../tests/unit/ui-page-coverage.test.ts), so a new page cannot silently escape coverage.

The second pass adds owner and staff views, guest and verified-customer views, private order access, populated checkout, address editing, bootstrap setup, missing records, empty search, and empty settings lists. Each rendered screen is checked at 1440px, 768px, and 375px, then scanned for serious/critical axe violations. Error-boundary headings are rejected for normal routes. Per-screen mobile screenshots and a JSON coverage report are retained in the test output. These automated checks complement source and screenshot review; they do not replace a full assistive-technology audit.

Additional improvements from this pass:

- Reports: readable total cards, responsive period filters, order-linked activity, and signed decimal currency entry.
- Commerce policies: decimal currency threshold input with clearing preserved.
- Stock history and returns: shared shadcn tables with explicit empty states.
- Translations, notifications, and customer credit: clearer empty-state messages.
- Shared tables: keyboard focus and visible outlines when horizontal scrolling is needed.
- Import and sign-in: corrected low-contrast supporting text.
- Mobile storefront: navigation occupies its own row so the store name stays readable; geometry is checked on every storefront screen.
- Staff catalog: usable read-only Products and Specifications views; owner-only editing, publishing, import, order export, mapping and reconciliation controls are hidden. Server-side write permissions remain enforced.

To repeat the audit against isolated synthetic data:

```sh
node scripts/test-browser.mjs tests/browser/ui-page-audit.spec.ts
```

## Admin page inventory

| Route                                 | Source                                                                                | Coverage                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/admin/activity`                     | [activity](../apps/backend/src/app/admin/activity/page.tsx)                           | Consistent records and explicit empty operation/delivery states.                                       |
| `/admin/attributes/[id]`              | [[id]](../apps/backend/src/app/admin/attributes/[id]/page.tsx)                        | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/attributes`                   | [attributes](../apps/backend/src/app/admin/attributes/page.tsx)                       | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/categories`                   | [categories](../apps/backend/src/app/admin/categories/page.tsx)                       | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/collections/[id]`             | [[id]](../apps/backend/src/app/admin/collections/[id]/page.tsx)                       | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/collections`                  | [collections](../apps/backend/src/app/admin/collections/page.tsx)                     | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/customers/[id]`               | [[id]](../apps/backend/src/app/admin/customers/[id]/page.tsx)                         | Order history table and empty credit/address states.                                                   |
| `/admin/customers`                    | [customers](../apps/backend/src/app/admin/customers/page.tsx)                         | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/fulfillment`                  | [fulfillment](../apps/backend/src/app/admin/fulfillment/page.tsx)                     | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/fulfillment/shipments`        | [shipments](../apps/backend/src/app/admin/fulfillment/shipments/page.tsx)             | Booking candidate table, empty state, missing-record boundary.                                         |
| `/admin/inventory/[id]`               | [[id]](../apps/backend/src/app/admin/inventory/[id]/page.tsx)                         | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/inventory`                    | [inventory](../apps/backend/src/app/admin/inventory/page.tsx)                         | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/inventory/pending`            | [pending](../apps/backend/src/app/admin/inventory/pending/page.tsx)                   | Order-linked hold review table with customer, timestamp, and empty state.                              |
| `/admin/inventory/slots`              | [slots](../apps/backend/src/app/admin/inventory/slots/page.tsx)                       | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/login`                        | [login](../apps/backend/src/app/admin/login/page.tsx)                                 | Authentication layout, readable form controls, error and focus treatment.                              |
| `/admin/orders/[id]/packing-slip`     | [packing-slip](../apps/backend/src/app/admin/orders/[id]/packing-slip/page.tsx)       | Print-specific layout retained; separate from the interactive workspace.                               |
| `/admin/orders/[id]`                  | [[id]](../apps/backend/src/app/admin/orders/[id]/page.tsx)                            | Order workspace, evidence, payment actions, customer context and activity.                             |
| `/admin/orders`                       | [orders](../apps/backend/src/app/admin/orders/page.tsx)                               | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin`                              | [admin](../apps/backend/src/app/admin/page.tsx)                                       | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/payments`                     | [payments](../apps/backend/src/app/admin/payments/page.tsx)                           | Evidence review, amount checks and consistent ledger controls.                                         |
| `/admin/products/[id]/edit`           | [edit](../apps/backend/src/app/admin/products/[id]/edit/page.tsx)                     | Shared product editor tabs, field spacing, table and responsive form treatment.                        |
| `/admin/products/[id]/options`        | [options](../apps/backend/src/app/admin/products/[id]/options/page.tsx)               | Shared product editor tabs, field spacing, table and responsive form treatment.                        |
| `/admin/products/[id]/organization`   | [organization](../apps/backend/src/app/admin/products/[id]/organization/page.tsx)     | Shared product editor tabs, field spacing, table and responsive form treatment.                        |
| `/admin/products/[id]/specifications` | [specifications](../apps/backend/src/app/admin/products/[id]/specifications/page.tsx) | Shared product editor tabs, field spacing, table and responsive form treatment.                        |
| `/admin/products/import`              | [import](../apps/backend/src/app/admin/products/import/page.tsx)                      | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/products/mapping`             | [mapping](../apps/backend/src/app/admin/products/mapping/page.tsx)                    | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/products/new`                 | [new](../apps/backend/src/app/admin/products/new/page.tsx)                            | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/products`                     | [products](../apps/backend/src/app/admin/products/page.tsx)                           | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/promotions`                   | [promotions](../apps/backend/src/app/admin/promotions/page.tsx)                       | Promotion table, status badges, edit dialog and clear state action.                                    |
| `/admin/reconciliation`               | [reconciliation](../apps/backend/src/app/admin/reconciliation/page.tsx)               | Side-by-side comparable ledger values in shared tables.                                                |
| `/admin/reports`                      | [reports](../apps/backend/src/app/admin/reports/page.tsx)                             | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/returns/[id]`                 | [[id]](../apps/backend/src/app/admin/returns/[id]/page.tsx)                           | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/returns`                      | [returns](../apps/backend/src/app/admin/returns/page.tsx)                             | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/settings/commerce`            | [commerce](../apps/backend/src/app/admin/settings/commerce/page.tsx)                  | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/settings/content`             | [content](../apps/backend/src/app/admin/settings/content/page.tsx)                    | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/settings/delivery`            | [delivery](../apps/backend/src/app/admin/settings/delivery/page.tsx)                  | Delivery coverage table, decimal money fields, weekly time-window editor.                              |
| `/admin/settings/notifications/[id]`  | [[id]](../apps/backend/src/app/admin/settings/notifications/[id]/page.tsx)            | Shared shadcn table/select and common editor/form treatment.                                           |
| `/admin/settings/notifications`       | [notifications](../apps/backend/src/app/admin/settings/notifications/page.tsx)        | Shared shadcn table/select and common editor/form treatment.                                           |
| `/admin/setup`                        | [setup](../apps/backend/src/app/admin/setup/page.tsx)                                 | Shared table directory; shipping, pickup, payment and staff tables with focused editors.               |
| `/admin/setup/verify-email`           | [verify-email](../apps/backend/src/app/admin/setup/verify-email/page.tsx)             | Standalone verification card, explanatory copy, and return to settings.                                |
| `/admin/store-credit/[id]`            | [[id]](../apps/backend/src/app/admin/store-credit/[id]/page.tsx)                      | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/store-credit`                 | [store-credit](../apps/backend/src/app/admin/store-credit/page.tsx)                   | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |
| `/admin/translations`                 | [translations](../apps/backend/src/app/admin/translations/page.tsx)                   | Shared admin navigation, skip target, form/table spacing, responsive controls and recovery boundaries. |

## Storefront pages

| Route                              | Source                                                                            | Coverage                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/[locale]/account`                | [account](../apps/storefront/app/[locale]/account/page.tsx)                       | Account, credit, order and address cards share spacing, inputs and focus treatment.    |
| `/[locale]/account/reset-password` | [reset-password](../apps/storefront/app/[locale]/account/reset-password/page.tsx) | Focused recovery card and return-to-account link.                                      |
| `/[locale]/cart`                   | [cart](../apps/storefront/app/[locale]/cart/page.tsx)                             | Shared bag cards and summary, touch targets and consistent empty-state icon.           |
| `/[locale]/categories/[slug]`      | [[slug]](../apps/storefront/app/[locale]/categories/[slug]/page.tsx)              | Result-first catalog header, wrapping filter tools and shared product cards.           |
| `/[locale]/checkout`               | [checkout](../apps/storefront/app/[locale]/checkout/page.tsx)                     | Shared checkout form, summary, responsive controls and consistent field treatment.     |
| `/[locale]/collections/[handle]`   | [[handle]](../apps/storefront/app/[locale]/collections/[handle]/page.tsx)         | Shared product cards, image fallback, empty-state action and labelled pagination.      |
| `/[locale]/orders/[id]`            | [[id]](../apps/storefront/app/[locale]/orders/[id]/page.tsx)                      | Order progress, totals, payment and return cards use the common responsive foundation. |
| `/[locale]`                        | [[locale]](../apps/storefront/app/[locale]/page.tsx)                              | Home hero retained; shared product cards, filter tools and navigation states.          |
| `/[locale]/pages/[slug]`           | [[slug]](../apps/storefront/app/[locale]/pages/[slug]/page.tsx)                   | Readable policy/article layout; shared header, footer and focus treatment.             |
| `/[locale]/products/[handle]`      | [[handle]](../apps/storefront/app/[locale]/products/[handle]/page.tsx)            | Readable purchase layout, image-selection state and shared control styling.            |
| `/[locale]/recover`                | [recover](../apps/storefront/app/[locale]/recover/page.tsx)                       | Redirect/alias retained; destination receives the shared polish.                       |
| `/[locale]/search`                 | [search](../apps/storefront/app/[locale]/search/page.tsx)                         | Result-first catalog header, wrapping filter tools and shared product cards.           |
| `/`                                | [app](../apps/storefront/app/page.tsx)                                            | Redirect/alias retained; destination receives the shared polish.                       |
| `/recover/exchange`                | [exchange](../apps/storefront/app/recover/exchange/page.tsx)                      | Standalone order-access card and return-to-shop link; explicit submission retained.    |
| `/recover`                         | [recover](../apps/storefront/app/recover/page.tsx)                                | Standalone recovery card, labels, localized notices and return navigation.             |

## Boundary and shared-surface coverage

- Admin layout and navigation: single list, contextual subsections, keyboard Go to page, skip link, mobile menu and print exclusion.
- Admin error and not-found: workspace context and explicit recovery actions.
- Storefront layout: localized navigation states, support links, policy links and skip navigation.
- Storefront error and not-found: localized states with a usable next action.
- Recovery exchange and email verification: standalone cards and explicit submission, preserving token semantics.
- All dialogs: shared responsive form styling and existing server actions.
- Pickup edits preserve existing split windows; omitted blackout-date changes retain existing closures.
- Optional monetary thresholds remain blank rather than becoming zero.
- Setup sections give tables the full content width; the profile form uses two columns on larger screens.
- Rejected staff changes reopen the relevant access editor with its error visible; successful changes clear that context.

## Follow-on capability gaps

Contact-method ownership verification remains a separate implementation task. This polish does not introduce providers, new financial state transitions, or unsupported payment approval shortcuts. Manual multi-page order selection is still unavailable; use filtered export for larger sets.

- Backend root [`/`](../apps/backend/src/app/page.tsx): redirect to `/admin`; destination receives the shared workspace polish.
