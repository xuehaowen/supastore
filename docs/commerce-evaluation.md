# Contextual commerce evaluation

Supastore evaluates optional commerce rules inside the existing backend. Products,
inventory identities, customers, orders and store-credit accounting remain
shared within one store. No additional service or tenant is introduced.

## Conditions and effects

Rules match fulfillment methods, destination countries, states/regions, postal
prefixes, pickup locations and activation dates. Conditions combine with AND;
values within a condition combine with OR. Destination conditions do not apply
to pickup. Regional/postal conditions require exactly one country. A pickup
location condition requires the pickup method and no destination conditions.

| Rule kind             | Effect                                                 | Fallback when no rule matches                              |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Product price         | Replace selected variants' unit price, including zero  | Existing variant price                                     |
| Product availability  | Offer or exclude selected variants                     | Existing publication/availability                          |
| Reward rate           | Select one order reward rate, including zero           | Store reward rate                                          |
| Free-shipping minimum | Replace the selected zone/area's free-shipping minimum | Existing zone/area minimum                                 |
| Promotion eligibility | Restrict an existing code to matching contexts         | Existing code eligibility if no enabled restriction exists |

Availability rules cannot override unpublished products, disabled variants,
insufficient stock or checkout validation. Reward rules cannot enable a disabled
reward program or override product/category exclusions. Earning credit requires
a verified linked customer and eligible external funding. Existing fulfillment
release, funding reconciliation and refund reversal continue to apply.

Lower priority numbers win; priorities are distinct within each kind. Missing
information needed by a potentially winning rule produces a pending result,
rather than silently selecting a fallback price. Disabled rules are ignored.
Starts are inclusive and ends exclusive. Enabled promotion restrictions form an
allowlist for their code, including their activation windows. Disabling the last
restriction removes that additional condition; the promotion's own activation,
minimum and redemption limits still apply.

Renaming a promotion through the Promotions editor moves its enabled and disabled
eligibility rules to the new code in the same transaction. The settings revision
advances and the change is audited. Reusing the old code for another promotion
does not inherit those rules.

Store currency/precision remain shared. Amounts use integer minor units and
reward rates use basis points: 500 means 5%. Rules do not convert currencies.

## Owner configuration and customer presentation

Owners use **Settings → Commerce rules** (`/admin/settings/rules`). The editor
supports multiple variants, fulfillment methods and pickup locations. Variant
search retains selections. Saves/deletions use revision fencing, the store lock,
reference validation and audit records. Failed validation retains the draft.
There are at most 100 rules and 100 entries in each target/condition list.
Ordinary commerce-policy saves do not erase rules.

The owner preview evaluates saved rules without reserving stock, spending credit,
redeeming promotions or issuing rewards. Customers can check product/cart options
and preview their checkout form. Messages distinguish missing context, exclusions
and insufficient stock. Base catalog/cart prices are labeled when rules are
enabled, and Product structured data omits unqualified offers. Stores containing
only disabled rules retain the base-price presentation.

`POST /api/v1/evaluation` accepts bounded variant quantities, shopping context and
an optional promotion code. It validates request origin and returns a decoded,
private/no-store estimate. Caller-selected prices, reward rates, customer IDs and
credit amounts are not authoritative inputs. Unpublished product details and raw
rules are not returned. Reward rates are estimates, not a promise that a guest
has earned credit. Scheduling and final funding remain checkout responsibilities.
Missing promotion context is shown as pending eligibility, rather than rejection.
Local-delivery qualification requires a supported country/postal destination and
one matching active delivery area. Missing details or overlapping areas keep
qualification pending until checkout; unsupported destinations are rejected.

## Calculation and acceptance

1. Validate fulfillment and normalize the destination or pickup location.
2. Resolve offered variants and contextual prices; read stock without reserving.
3. Validate the promotion and allocate its merchandise discount.
4. Calculate shipping from the **post-discount merchandise subtotal**. A contextual
   minimum replaces the zone/area minimum even when higher. Destination checks
   still apply.
5. Calculate tax and total with the existing exact-money calculations.
6. Snapshot the settings revision, context, matched rule IDs, accepted prices,
   promotion and reward rate in the quote.
7. Reevaluate at order acceptance; changed terms require another review. Reserve
   stock, capacity, credit and promotion usage using existing transactions/locks.
8. Preserve accepted order terms through fulfillment, reward release and refunds.
   Later rule edits cannot rewrite accepted orders.

The previous shipping implementation used a pre-discount subtotal; this release
aligns it with the existing adjusted-subtotal transaction contract. Qualification
therefore changes for discounted baskets even without contextual rules. Credit
is funding, not a discount, and does not reduce the free-shipping qualifying sum.

## Deployment and limits

Apply migration `0040_contextual_commerce` before deploying code that reads
`store_settings.commerce_rules`. Existing rows receive an empty array. Accepted
orders are unchanged; older outstanding quotes may need fresh review after the
upgrade. Rollback requires schema-compatible images and preserved financial data.

This version supports contextual overrides and the existing single-code
merchandise promotions. Customer-group pricing, quantity tiers, multi-currency,
arbitrary formulas, promotion stacking and shipping-only coupon benefits require
separate scope. Preview selections are estimates; checkout collects and validates
its own fulfillment details. No merchant brand, region or rate is installed as
a platform default.

## Local acceptance (2026-10-17)

The implementation passed 1,203 unit/library tests, 152 PostgreSQL integration
tests and 75 error-contract tests. Evaluator coverage exceeds the unchanged 90%
threshold: 95.55% statements, 93.33% branches, 95.45% functions and 95.34% lines.
Type checking, lint and formatting checks pass. The final code review found no
remaining confirmed issues.

The complete production-build browser suite passed all 48 cases, including the
responsive/accessibility page audit. A fresh production build and the three
contextual-commerce browser cases additionally verify the final named country
selectors and labeled base-price presentation. Browser cases cover owner edits,
failed-save draft retention, regional customer pricing through checkout,
disabled-rule fallback and global availability edits. Existing bundle limits
remain unchanged. See the [acceptance record](benchmarks/2026-10-17-commerce-evaluation.json)
for scope and measurements.

These checks use isolated synthetic data. They do not establish public deployment,
real email delivery, payment receipt or acceptance of a merchant's actual rules.

### Review follow-up (2026-10-17)

The promotion-rename, pending-promotion presentation and local-delivery preview
fixes passed 1,204 unit/library tests, 155 PostgreSQL integration tests and all 49
production-build browser cases. Type checking, lint, formatting and unchanged
bundle budgets pass. The shared delivery-domain validation exceeds the unchanged
90% coverage threshold. No additional database migration is required. See the
[review-fix acceptance record](benchmarks/2026-10-17-commerce-review-fixes.json).
