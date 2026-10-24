"use client";

import Link from "./shopping-link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavigationPending } from "./navigation-pending";
import { textFor } from "@supastore/i18n/messages";

export function StorefrontNavLink({
  href,
  children,
  className,
  shop = false,
  locale,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  shop?: boolean;
  locale: string;
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
      <NavigationPending label={textFor(locale).common.wait} />
    </Link>
  );
}
