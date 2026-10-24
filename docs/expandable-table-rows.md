# Expandable table rows

Use `ExpandableTableRow` from `@supastore/ui/expandable-table-row` for inline
details in tables of orders, payments, users, or other records. It supplies the
disclosure button, independent expansion state, keyboard interaction, accessible
labels and targets, and a detail row spanning the table.

The table header must include a leading disclosure column. `children` contains
the remaining summary cells; `details` accepts any React content, including
server-rendered content. `columnCount` includes every column, including the
disclosure and any selection checkboxes. Rows start collapsed; set
`defaultExpanded` to start one open. Give each row a stable React key.

```tsx
import { ExpandableTableRow } from "@supastore/ui/expandable-table-row";

<ExpandableTableRow
  key={payment.id}
  columnCount={4}
  detailsLabel={`Payment details for ${payment.reference}`}
  expandLabel={`Show payment ${payment.reference}`}
  collapseLabel={`Hide payment ${payment.reference}`}
  details={<PaymentDetails payment={payment} />}
>
  <TableCell>{payment.reference}</TableCell>
  <TableCell>{payment.customerName}</TableCell>
  <TableCell>{formattedAmount}</TableCell>
</ExpandableTableRow>;
```

Use the same component with user summary cells and a user detail panel. A caller
can wrap it when a domain needs a repeated detail layout: `ExpandableOrderRow`
is the order adapter and supplies the item table and empty-order message.

Keep data loading, authorization, currency formatting, and domain-specific empty
states in the caller. The shared component handles presentation and interaction.
The order list loads items in one batch for its visible page. Opening a preview
does not navigate or submit a form. Detail content mounts when expanded and
unmounts when collapsed.

## Backend usage

- Orders: historical items, quantities, and formatted prices.
- Payment ledger: original reference, receiving account, recording time, order
  total, store credit, fulfillment method, and an order link.
- Customer profiles: phone number, creation date, and last profile update.
- Guest contacts: first and latest order times, with the existing distinction
  between a contact summary and account ownership.
- Team and access: membership creation and update times. Existing access
  management remains available in the summary row.

These previews use the same authorization and paginated queries as their tables.
