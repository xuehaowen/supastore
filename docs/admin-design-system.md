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

Panels use 12px corners and 16–24px padding. Forms retain their existing labels,
validation, permissions, and server actions. Focus rings remain visible and
motion respects the reduced-motion preference. The console uses a light theme;
all theme variables are scoped to .admin-workspace in apps/backend/src/app/admin/admin.css.
Print layouts hide navigation.
