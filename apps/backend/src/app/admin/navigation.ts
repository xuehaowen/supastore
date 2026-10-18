export type AdminSection = {
  href: string;
  label: string;
  icon:
    | "overview"
    | "orders"
    | "payments"
    | "fulfillment"
    | "products"
    | "customers"
    | "promotions"
    | "reports"
    | "settings";
  ownerOnly?: boolean;
  children?: { href: string; label: string; ownerOnly?: boolean }[];
};

export const adminNavigation: { label: string; sections: AdminSection[] }[] = [
  {
    label: "Daily operations",
    sections: [
      { href: "/admin", label: "Overview", icon: "overview" },
      {
        href: "/admin/orders",
        label: "Orders",
        icon: "orders",
        children: [
          { href: "/admin/orders", label: "All orders" },
          { href: "/admin/returns", label: "Returns" },
        ],
      },
      {
        href: "/admin/payments",
        label: "Payments",
        icon: "payments",
        children: [
          { href: "/admin/payments", label: "Payment review" },
          {
            href: "/admin/reconciliation",
            label: "Credit & stock reconciliation",
            ownerOnly: true,
          },
        ],
      },
      {
        href: "/admin/fulfillment",
        label: "Fulfillment",
        icon: "fulfillment",
        children: [
          { href: "/admin/fulfillment", label: "Fulfillment queue" },
          {
            href: "/admin/fulfillment/shipments",
            label: "Shipments & booking",
          },
          { href: "/admin/inventory/slots", label: "Schedules & capacity" },
        ],
      },
    ],
  },
  {
    label: "Store management",
    sections: [
      {
        href: "/admin/products",
        label: "Products",
        icon: "products",
        children: [
          { href: "/admin/products", label: "All products" },
          { href: "/admin/inventory", label: "Inventory" },
          {
            href: "/admin/inventory/pending",
            label: "Overdue stock & credit holds",
          },
          { href: "/admin/categories", label: "Categories", ownerOnly: true },
          { href: "/admin/collections", label: "Collections", ownerOnly: true },
          {
            href: "/admin/attributes",
            label: "Attributes & options",
            ownerOnly: true,
          },
          { href: "/admin/products/import", label: "Import & export" },
          {
            href: "/admin/products/mapping",
            label: "Import mappings",
            ownerOnly: true,
          },
        ],
      },
      {
        href: "/admin/customers",
        label: "Customers",
        icon: "customers",
        children: [
          { href: "/admin/customers", label: "All customers" },
          { href: "/admin/store-credit", label: "Store credit" },
        ],
      },
      {
        href: "/admin/promotions",
        label: "Promotions",
        icon: "promotions",
        ownerOnly: true,
      },
      { href: "/admin/reports", label: "Reports", icon: "reports" },
      {
        href: "/admin/setup",
        label: "Settings",
        icon: "settings",
        ownerOnly: true,
        children: [
          { href: "/admin/setup", label: "Store setup" },
          { href: "/admin/settings/commerce", label: "Checkout & rewards" },
          { href: "/admin/settings/rules", label: "Commerce rules" },
          { href: "/admin/settings/delivery", label: "Local delivery areas" },
          {
            href: "/admin/settings/content",
            label: "Store information & policies",
          },
          { href: "/admin/settings/notifications", label: "Notifications" },
          { href: "/admin/translations", label: "Languages & translations" },
          { href: "/admin/activity", label: "Activity history" },
        ],
      },
    ],
  },
];

export function visibleAdminNavigation(owner: boolean) {
  return adminNavigation.map((group) => ({
    ...group,
    sections: group.sections
      .filter((section) => owner || !section.ownerOnly)
      .map((section) => ({
        ...section,
        children: section.children?.filter(
          (child) => owner || !child.ownerOnly,
        ),
      })),
  }));
}

export function currentAdminLocation(pathname: string, owner: boolean) {
  const candidates = visibleAdminNavigation(owner).flatMap((group) =>
    group.sections.flatMap((section) =>
      (section.children ?? [{ href: section.href, label: section.label }]).map(
        (page) => ({ section, page }),
      ),
    ),
  );
  return candidates
    .filter(
      ({ page }) =>
        pathname === page.href ||
        (page.href !== "/admin" && pathname.startsWith(`${page.href}/`)),
    )
    .sort((a, b) => b.page.href.length - a.page.href.length)[0];
}
