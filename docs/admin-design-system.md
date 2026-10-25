# Admin design system

The admin workspace uses a separate visual system from the customer storefront.
Direction: a compact management console with persistent navigation, neutral
surfaces, restrained blue accents, and clear operational hierarchy.

Based on the ui-ux-pro-max dashboard recommendations: slate text (#1e293b),
soft gray canvas (#f6f8fb), white panels, blue actions (#2563eb), and subtle
borders (#dce3ed). Retain the existing Geist font for a consistent, locally
integrated sans-serif interface. Do not use storefront serif headings here.

Navigation is fixed on desktop and becomes a two-column link grid on mobile.
Use icons with visible labels and aria-current for the active page. Keep real
operational counts; do not invent revenue, trends, or status indicators.
Group navigation into Daily work and Manage store, and hide owner-only
destinations from staff. Backend authorization remains required for every action.
Place Needs attention queues before sales metrics on the overview.

Order references and View order actions open the same order workspace for every
status. Dispatch and delivery are separate actions; pickup readiness and verified
handoff are available from that workspace. Fulfillment queues link to it.
Order back links and stock-count results preserve the originating search,
filters, and pagination through validated admin return paths. Fulfillment defaults
to outstanding work; preparation, pickup readiness, transit, completed history,
and all operations are selectable before pagination. Delivery forms prefill
dispatch details, and omitted values preserve the stored carrier and tracking.
Cash receipt forms list active cash accounts only, enforced again in the backend.
Stock history retains the inventory return filter through movement pagination.
Collapsed fulfillment rows show the current stage and next action. Pickup handoff
is available after readiness; the server also validates readiness on submission.
Partial dispatch remains visible in preparation work and directs staff to the
remaining units. Shipment management retains the order's return context through
saves and errors, and hides dispatch when every unit has shipped.

Operational payment, refund, payout, and credit forms use CurrencyField to accept
decimal amounts with visible currency codes. It submits canonical integer minor
units without floating-point conversion. Detailed refund fields must submit only
their canonical names. Staff can record physical inventory counts, while only
owners can change stock tracking; enforce this distinction inside the transaction.

Panels use 12px corners and 16–24px padding. Forms retain their existing labels,
validation, permissions, and server actions. Focus rings remain visible and
motion respects the reduced-motion preference. The console uses a light theme;
all theme variables are scoped to .admin-workspace in apps/backend/src/app/admin/admin.css.
Print layouts hide navigation.
