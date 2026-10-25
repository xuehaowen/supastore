"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWorkspace } from "./workspace-context";

export function ProductEditorNav({ productId }: { productId: string }) {
  const pathname = usePathname();
  const { owner } = useWorkspace();
  const pages = owner
    ? [
        ["edit", "Details & pricing"],
        ["options", "Options & variants"],
        ["specifications", "Attributes"],
        ["organization", "Collections"],
      ]
    : [["specifications", "Attributes"]];
  return (
    <nav className="admin-tabs" aria-label="Product editor sections">
      {pages.map(([path, label]) => {
        const href = `/admin/products/${productId}/${path}`;
        return (
          <Link
            key={path}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
