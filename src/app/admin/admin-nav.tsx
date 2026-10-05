"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  Box,
  ClipboardList,
  LayoutDashboard,
  CreditCard,
  Truck,
  Users,
  Languages,
  Tag,
  ScrollText,
  Settings2,
  Store,
  Menu,
  X,
} from "lucide-react";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/store-credit", label: "Store credit", icon: CreditCard },
  { href: "/admin/products", label: "Products", icon: Box },
  { href: "/admin/inventory", label: "Inventory", icon: Box },
  { href: "/admin/promotions", label: "Promotions", icon: Tag },
  { href: "/admin/fulfillment", label: "Fulfillment", icon: Truck },
  { href: "/admin/returns", label: "Returns", icon: Box },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/translations", label: "Translations", icon: Languages },
  { href: "/admin/setup", label: "Settings", icon: Settings2 },
  { href: "/admin/activity", label: "Activity", icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const current = links.findLast(
    (link) =>
      pathname === link.href ||
      (link.href !== "/admin" && pathname.startsWith(`${link.href}/`)) ||
      (link.href === "/admin/setup" &&
        pathname.startsWith("/admin/settings/")) ||
      (link.href === "/admin/products" &&
        ["/admin/categories", "/admin/collections", "/admin/attributes"].some(
          (path) => pathname === path || pathname.startsWith(`${path}/`),
        )),
  );

  return (
    <>
      <nav
        className={`admin-sidebar${menuOpen ? " mobile-open" : ""}`}
        aria-label="Admin"
      >
        <div className="workspace-mobile-header">
          <Link href="/admin" className="workspace-brand">
            <span className="workspace-mark">
              <Store size={20} aria-hidden="true" />
            </span>
            <span>
              SupaStore<small>Management console</small>
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="workspace-menu-toggle"
            aria-label={menuOpen ? "Close admin menu" : "Open admin menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
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
