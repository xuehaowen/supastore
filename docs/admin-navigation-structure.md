# Admin section structure

The sidebar uses a single list of main sections without category headings. Only
the current main section expands its subsection links. Existing URLs are retained.
The header shows the main section and the current subsection. Product tabs and
the sidebar share the same navigation definition in
`apps/backend/src/app/admin/navigation.ts`.

| Main section | Subsections                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview     | Operational overview                                                                                                                                 |
| Orders       | All orders; returns                                                                                                                                  |
| Payments     | Payment review; credit and stock reconciliation (owner)                                                                                              |
| Fulfillment  | Fulfillment queue; shipments and booking; schedules and capacity                                                                                     |
| Products     | All products; inventory; overdue stock and credit holds; categories; collections; attributes and options; import and export; import mappings         |
| Customers    | All customers; store credit                                                                                                                          |
| Promotions   | Promotion management (owner)                                                                                                                         |
| Reports      | Sales and operational reporting                                                                                                                      |
| Settings     | Store setup; checkout and rewards; local delivery areas; store information and policies; notifications; languages and translations; activity history |

Settings, promotions, reconciliation, categories, collections, attributes, and
import mappings are hidden from staff navigation to match their existing owner
requirements. Server authorization remains responsible for access enforcement.

Store setup includes a shared shadcn table directory linking to profile and taxes,
shipping, pickup, payment methods and email delivery, team access, and the other
settings pages. In-page links jump to the corresponding existing forms.

## Follow-on capabilities

This change organizes existing screens. Contact methods still need a dedicated
Settings page with persistent records, public visibility and preferred contact
controls, and provider-backed verification. Owner email delivery verification
must not be presented as verification of a customer-facing contact method.

Dedicated stock movement, transfer, and stock count workspaces can be added under
Products when implemented. Do not show navigation links to unimplemented pages.
Shipping, pickup, payment account configuration, and team access currently remain
in Store setup and now use shared tables with focused editors. They can become
dedicated settings pages if the number of records warrants it.
