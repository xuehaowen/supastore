"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function StorefrontNavLink({
  href,
  children,
  className,
  shop = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  shop?: boolean;
}) {
  const pathname = usePathname();
  const path = href.split("?", 1)[0]!;
  const active = shop
    ? pathname === path ||
      ["search", "products", "collections", "categories"].some((section) =>
        pathname.startsWith(`${path}/${section}`),
      )
    : pathname === path || pathname.startsWith(`${path}/`);
  return (
    <Link
      href={href}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
