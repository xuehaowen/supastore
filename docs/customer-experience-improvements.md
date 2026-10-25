# Customer experience improvements

Scope: every customer-facing route in `tests/browser/ui-route-manifest.ts`, in
English and Chinese, at mobile, tablet and desktop widths. Admin interfaces are
outside this work. Existing transaction, authorization and privacy rules remain
authoritative.

## Required outcomes and evidence

| Surface                                                     | Outcome                                                                                                                                                         | Verification                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Home, search, categories, collections                       | Preserve shopping context; removable filters; accurate available prices and stock; recover from empty results                                                   | `storefront-shopping-ux`, `storefront-redesign`, page audit                              |
| Product details                                             | Accessible gallery with enlargement and zoom; valid variant/quantity selections; add feedback; reachable mobile purchase action                                 | `customer-experience`, `storefront-fixes`, page audit                                    |
| Bag                                                         | Safe quantity edits and undo; correlated errors; destination-based delivery estimate and free-shipping qualification                                            | `storefront-shopping-ux`, `customer-experience`, `commerce-summary`                      |
| Checkout                                                    | Separate address fields; saved address selection; retained edits; inline bilingual validation; first-error focus; explicit pending states; authoritative review | `storefront-shopping-ux`, `customer-experience`, `regional-shipping`, `storefront-fixes` |
| Account and addresses                                       | Clear sign-in/register/recovery flows, inline guidance, autofill, pending feedback and visible sign-out failures                                                | `customer-experience`, page audit, authentication journeys                               |
| Orders, payments and returns                                | Fulfillment destination/schedule and recorded tracking reference; accessible progress; styled pending actions; retained authorization/privacy                   | `customer-experience`, page audit, existing customer journeys                            |
| Recovery, password reset, SMS, information and policy pages | Usable localized forms, meaningful success/error states, navigation and readable responsive content                                                             | page audit, existing recovery/SMS journeys                                               |
| Missing and failed pages                                    | Localized explanation and recovery navigation                                                                                                                   | page audit, `error-handling`                                                             |

Completion requires current passing behavioral checks plus a route-wide rendered
audit. Source inspection or a subset of green tests alone does not prove all
surfaces complete. Record unresolved findings rather than treating them as passes.

## Implementation notes

Delivery estimates use the existing server-side shipping/delivery calculation.
They are not reservations or final order totals; checkout recalculates the final
amount. Unknown destinations and overlapping delivery areas do not receive a
fabricated estimate. Image enlargement loads on demand and returns focus when
closed. The mobile purchase bar submits the same product form and uses its
current variant, quantity and availability.

Customer forms retain backend validation as the authority while adding localized
field guidance and focus handling before submission. Pending server-form buttons
use React form status. Failed bag edits retain their support reference and retry
state.

## Audit status

The production builds and TypeScript checks pass. The complete unit run passes
1,402 tests, the error-handling suite passes 79 tests with its coverage gate, and
commerce evaluation passes 20 integration checks.

The rendered audit covers all 19 customer route sources, including English and
Chinese, signed-in accounts, address editors, populated checkout, empty search
and missing pages. Screens were checked at widths 375, 768 and 1440, with no
horizontal overflow or serious/critical axe findings. The combined customer and
admin audit recorded 119 screens; its report is retained locally at
`.tmp-cuj/customer-ux-page-coverage.json`.

Behavioral checks pass for gallery zoom and keyboard return, mobile purchasing,
checkout validation and pending states, shipping estimates, current order
addresses and tracking, cart recovery, saved addresses, promotions, regional
rates, session isolation and SMS consent. Additional journeys pass for account
registration, password reset, keyboard checkout, unsupported destinations and
failed-upload retry. Automated accessibility checks do not replace manual
assistive-technology testing.

## Browsing and product decisions

The bag shows its items and checkout summary before destination estimates.
Catalog sorting applies immediately through a separate control and preserves
the current query, category and options while resetting pagination. Product
pages show up to four specifications beside purchase controls, with a link to
the full list when needed. Pagination reports both the page and product range;
out-of-range requests recover to the last valid page.

Search, sorting, category and filter changes use ordinary GET navigation.
Sorting waits for its change handler to be ready and provides a separate
submit control when JavaScript is disabled. Search results render directly on
the server, without a loading boundary that depends on client scripts to reveal
the results.

Empty searches explain how to revise a query and offer category links that
remove the unsuccessful query. Recently viewed products provide onward
browsing using a bounded per-tab history separated by language; customers can
clear the history. History does not store prices or customer information.

`storefront-browsing.spec.ts` covers the new sorting, pagination recovery,
specifications, mobile bag order, bilingual search recovery and recently viewed
flows. These changes also run through the existing customer-experience,
shopping-UX and responsive page audit suites.

This round passes all six new browsing scenarios, the existing seven customer
experience scenarios, six shopping-UX scenarios and both page-audit checks.
The final audit records 119 screens with no serious/critical axe findings.
Both production builds, TypeScript, scoped lint/format checks and 20 focused unit
tests pass. The latest audit and mobile captures are retained locally in
`.tmp-cuj/browsing-evidence/`.

Collection and category ordering controls and the complete collection directory
are documented in [Storefront navigation order](storefront-navigation-order.md).
That addition expands customer route coverage to 20 sources.
