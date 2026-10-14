# Authorized read models

admin-operations.ts loads the data needed by merchant operations views after
checking active staff membership inside the transaction. Receipts are scoped to
the displayed order and payment results. Payouts, evidence, and failed deliveries
have independent pages of 50 records, with a 51st record detecting the next page.
Related payout attempts and discrepancies follow the selected allocations.

Fulfillment uses pages of 50 eligible orders with deterministic creation time/ID
ordering. Owner receipt work retains its existing eligibility; staff see
confirmed/completed orders. Selected orders are loaded independently of the page,
with their receipts included in the authorized read model.

Overview queue counts are SQL aggregates across the full store history; loading
a page does not require materializing that history. Keep filters and ordering in
the query layer and presentation in the admin components.
