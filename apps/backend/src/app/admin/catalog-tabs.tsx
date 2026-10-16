"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentAdminLocation, visibleAdminNavigation } from "./navigation";
import { useWorkspace } from "./workspace-context";

export function CatalogTabs() {
  const pathname = usePathname();
  const { owner } = useWorkspace();
  const section = visibleAdminNavigation(owner)
    .flatMap((group) => group.sections)
    .find((item) => item.href === "/admin/products");
  const current = currentAdminLocation(pathname, owner);
  return (
    <nav className="admin-tabs" aria-label="Catalog sections">
      {section?.children?.map((tab) => (
        <Link
          href={tab.href}
          key={tab.href}
          aria-current={current?.page.href === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
