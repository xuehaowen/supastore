"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@supastore/ui/button";
import {
  ArrowUpRight,
  Box,
  ClipboardList,
  LayoutDashboard,
  CreditCard,
  Truck,
  Users,
  Tag,
  Settings2,
  Store,
  Menu,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace-context";
import { QuickNavigation } from "./quick-navigation";
import { StaffSignOut } from "./staff-sign-out";
import { currentAdminLocation, visibleAdminNavigation } from "./navigation";

const sectionIcons = {
  overview: LayoutDashboard,
  orders: ClipboardList,
  payments: CreditCard,
  fulfillment: Truck,
  products: Box,
  customers: Users,
  promotions: Tag,
  reports: LayoutDashboard,
  settings: Settings2,
};

export function AdminNav() {
  const { owner } = useWorkspace();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);
  const current = currentAdminLocation(pathname, owner);
  return (
    <>
      <nav
        id="admin-navigation"
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
            aria-controls="admin-navigation"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
        <div className="workspace-links workspace-main-links">
          {visibleAdminNavigation(owner)
            .flatMap((group) => group.sections)
            .map((section) => {
              const Icon = sectionIcons[section.icon];
              const active = current?.section.href === section.href;
              return (
                <div className="workspace-nav-section" key={section.href}>
                  <Link
                    href={section.href}
                    data-active={active || undefined}
                    aria-current={
                      active && !section.children ? "page" : undefined
                    }
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{section.label}</span>
                  </Link>
                  {active && section.children && (
                    <nav
                      className="workspace-subnav"
                      aria-label={section.label + " sections"}
                    >
                      {section.children.map((child) => (
                        <Link
                          href={child.href}
                          key={child.href}
                          aria-current={
                            current?.page.href === child.href
                              ? "page"
                              : undefined
                          }
                        >
                          {child.label}
                        </Link>
                      ))}
                    </nav>
                  )}
                </div>
              );
            })}
        </div>
        <div className="workspace-footer">
          <StaffSignOut />
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
          <strong>{current?.section.label ?? "Admin"}</strong>
          {current && current.page.label !== current.section.label && (
            <>
              {" "}
              <span aria-hidden="true">/</span> {current.page.label}
            </>
          )}
        </span>
        <div className="workspace-context">
          <QuickNavigation />
        </div>
      </header>
    </>
  );
}
