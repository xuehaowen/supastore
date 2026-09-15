"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/products", label: "Products", match: "/admin/products" },
  {
    href: "/admin/categories",
    label: "Categories",
    match: "/admin/categories",
  },
  {
    href: "/admin/products/import",
    label: "Import & export",
    match: "/admin/products/import",
  },
];

export function CatalogTabs() {
  const pathname = usePathname();
  const current = pathname.startsWith("/admin/products/import")
    ? "/admin/products/import"
    : tabs.find((tab) => pathname.startsWith(tab.match))?.href;
  return (
    <nav className="admin-tabs" aria-label="Catalog sections">
      {tabs.map((tab) => (
        <Link
          href={tab.href}
          key={tab.href}
          aria-current={current === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
