"use client";

import { useLinkStatus } from "next/link";

export function NavigationPending({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status">
      <span className="storefront-navigation-progress" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  ) : null;
}
