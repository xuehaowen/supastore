# Order and payment workflow updates

## Order and payment numbers

Orders display a permanent number such as `ORD-000001`; each recorded payment
displays its own number such as `PAY-000001`, including cash and online payments.
PostgreSQL sequences allocate numbers safely during concurrent writes. Six digits
is the minimum width; numbers grow past `999999` and may have gaps after rollbacks.
Numbers are identifiers, while access still requires the existing authorization.

Migration `0051_commerce_references` assigns numbers to existing pre-launch records
in creation order (with UUID as a tie breaker). Order numbers replace the previous
format in place; no legacy aliases or lookup behavior are retained. UUIDs, links,
payment amounts, bank references, Stripe IDs, and cash receipt numbers are preserved.

The payment ledger shows the payment number first, with the original transaction
reference in its expanded details. Both numbers and transaction references are
searchable. Copy buttons are available for order numbers on order details and for
payment numbers and transaction references in the ledger. Customer screens,
new notifications, exports, and packing slips use the order number through the
existing `referenceCode` contract. Apply the migration with the corresponding app
release; this schema change requires coordinated deployment.

Reference search also accepts numbers without their hyphen, lowercase text,
spaces, and shorter numeric portions after the prefix: `ord123`, `ORD000123`, and
`ORD 000 123` resolve to `ORD-000123`. The same normalization is used in admin
search, filtered exports, returns, account history, and guest recovery. Recovery
still requires the matching email and issues the existing scoped access token.
Order rows include copy controls, and order numbers in the payment ledger link
directly to their order details.

The ledger shows **Order payment status** separately from order lifecycle status.
Funding includes all corrected receipts for that order and applied store credit,
less settled non-purchase returns. A deposit can therefore show **Partially paid**
while the lifecycle remains unpaid. Actual settled purchase refunds, including
store-credit settlements, show **Partially refunded** or **Refunded**; pending
authorizations do not. Non-purchase returns remain distinct from purchase refunds.
The existing Order status filter continues to filter lifecycle status.

## Reference patterns

- [Medusa payment management](https://docs.medusajs.com/user-guide/orders/payments): payment status and explicit payment actions in the order workspace.
- [Shopify order exports](https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders): explicit selection of the orders to export.
- [WooCommerce order details](https://woocommerce.com/document/managing-orders/view-edit-or-add-an-order/): customer information, order items, payment information, and activity within the order workspace.
- [Figma component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties): consistent reusable controls across different contexts.

These inform the interaction design; the implementation uses the existing shared
shadcn components and existing authorized financial operations.

## Navigation

The sidebar presents one list of main sections without Daily operations or Store
management headings. The active section shows its subsection links.

## Payment evidence

Payments shows finalized evidence with its actual order, customer, status, and
purchase total. Order information is joined directly, so evidence for orders
outside the latest order page remains reviewable.

Click Review evidence or the thumbnail to open an expanded workspace. It includes
image zoom and fit controls, original-image access, recorded receipts, and forms
to record a verified receipt and confirm exact payment. Recording a receipt keeps
the evidence review open; failures appear in the review. Confirmation still runs
the existing funding, payout, authorization, and order-state checks. An uploaded
image is not proof of cleared funds and is never automatically converted into a
receipt.

Order details include financial totals, items, evidence and receipts, fulfillment,
returns and refunds, and chronological activity. A context column contains the
customer, destination, fulfillment status, and payment summary. The Record payment
dialog includes submitted evidence next to the form. Only finalized uploads are
displayed.

## Order exports

Each order row has a disclosure arrow to expand or collapse its items inline.
The preview shows historical item names, SKUs when recorded, quantities, unit
prices, and line totals in currency units. Expanding a row preserves order
selection and the current filters; multiple orders can be expanded independently.
Only items for the current page are loaded.

Owners select rows using the order table checkboxes. Export defaults to selected
orders and stays disabled until at least one order is selected. Scope choices are:

- Selected orders on the current page.
- Every order on the current page.
- Every order matching the current filters.
- All orders, chosen explicitly.

CSV and XLSX share the same server-side selection and filters. Selected IDs must
be valid UUIDs, with 1–50 unique orders per selected download; invalid or empty
selection fails instead of falling back to all orders. Existing unscoped API
downloads remain compatible. Product import/export links to the Orders page for
order selection instead of downloading every order immediately.

Order exports use a single read-only database snapshot across all batches.
Concurrent rescheduling or changes to order totals do not duplicate or skip
orders during a sorted download. The connection is released when streaming
finishes or is cancelled.

Selection resets on navigation to a different order page or filters. Multi-page
manual selection is not currently supported; use the matching-filter scope to
export a larger result set.

The order list supports ascending and descending sorting by creation time,
pickup location, pickup time, customer name, and total. Filters include search,
status, customer name or email, fulfillment type, pickup location, creation date
range (UTC), pickup date and start-time ranges (store local time), and minimum
and maximum total in currency units. Filters and ordering persist through pages
and order details. Filtered exports use the same filters and ordering; selected,
current-page, and all-order exports retain the chosen ordering.

Each CSV or XLSX row represents one order item, with historical item name and SKU,
quantity, unit price, and line total. Order-level information repeats for each
item; an order without items still receives one row. Exports include pickup
location, address, date, time window, timezone, and shipping address components.
Amounts use decimal currency units (for example, `22.50` instead of `2250`), with
an explicit currency column. Monetary column names no longer end in `_cents`.
XLSX amounts remain numeric and use decimal formatting. XLSX supports up to
10,000 item rows; use CSV for larger exports.
