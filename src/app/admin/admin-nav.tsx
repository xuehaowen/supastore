"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Box,
  ClipboardList,
  Download,
  LayoutDashboard,
  CreditCard,
  Truck,
  Users,
  Languages,
  Tag,
  Shapes,
  ScrollText,
  Settings2,
  Store,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/products", label: "Products", icon: Box },
  { href: "/admin/categories", label: "Categories", icon: Shapes },
  { href: "/admin/products/import", label: "Import products", icon: Download },
  { href: "/admin/fulfillment", label: "Fulfillment", icon: Truck },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/translations", label: "Translations", icon: Languages },
  { href: "/admin/setup", label: "Settings", icon: Settings2 },
  { href: "/admin/activity", label: "Activity", icon: ScrollText },
  { href: "/admin/promotions", label: "Promotions", icon: Tag },
];

export function AdminNav() {
  const pathname = usePathname();
  const current = links.findLast(
    (link) =>
      pathname === link.href ||
      (link.href !== "/admin" && pathname.startsWith(`${link.href}/`)),
  );

  return (
    <>
      <nav className="admin-sidebar" aria-label="Admin">
        <Link href="/admin" className="workspace-brand">
          <span className="workspace-mark">
            <Store size={20} aria-hidden="true" />
          </span>
          <span>
            SupaStore<small>Management console</small>
          </span>
        </Link>
        <p className="nav-caption">WORKSPACE</p>
        <div className="workspace-links">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={current?.href === href ? "page" : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
        <div className="workspace-footer">
          <Link href="/">
            <Store size={17} aria-hidden="true" />
            View shop
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
          <small>SupaStore · Admin workspace</small>
        </div>
      </nav>
      <header className="workspace-topbar">
        <span>
          Workspace <span aria-hidden="true">/</span>{" "}
          <strong>{current?.label ?? "Admin"}</strong>
        </span>
        <span className="workspace-context">Store management</span>
      </header>
    </>
  );
}
