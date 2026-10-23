"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
const StorefrontSheet = dynamic(() => import("./storefront-sheet"), {
  ssr: false,
});
import { Button } from "@supastore/ui/button";
import { designCopy } from "../lib/design-copy";

export function StorefrontMenu({
  locale,
  accountLabel,
  recoverLabel,
}: {
  locale: string;
  accountLabel: string;
  recoverLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const m = designCopy(locale);
  return (
    <>
      <Button
        ref={trigger}
        variant="ghost"
        size="icon"
        className="mobile-menu-trigger"
        aria-label={m.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <Menu />
      </Button>
      {loaded && (
        <StorefrontSheet
          open={open}
          onOpenChange={setOpen}
          triggerRef={trigger}
          title={m.menu}
          description={m.shop}
          closeLabel={m.close}
        >
          <nav
            className="grid gap-2 text-lg"
            aria-label={m.menu}
            onClick={() => setOpen(false)}
          >
            <Link className="border-b py-4" href={`/${locale}`}>
              {m.shop}
            </Link>
            <Link className="border-b py-4" href={`/${locale}/search`}>
              {m.search}
            </Link>
            <Link className="border-b py-4" href={`/${locale}/account`}>
              {accountLabel}
            </Link>
            <Link className="border-b py-4" href={`/recover?locale=${locale}`}>
              {recoverLabel}
            </Link>
          </nav>
        </StorefrontSheet>
      )}
    </>
  );
}

export function StorefrontHeader({
  children,
  checkoutBrand,
  checkoutLink,
}: {
  children: ReactNode;
  checkoutBrand: ReactNode;
  checkoutLink: ReactNode;
}) {
  const pathname = usePathname();
  const checkout = /^\/(en|zh)\/checkout\/?$/.test(pathname);
  return (
    <header
      className={
        checkout
          ? "storefront-header storefront-checkout-header"
          : "storefront-header"
      }
    >
      {checkout ? (
        <>
          {checkoutBrand}
          {checkoutLink}
        </>
      ) : (
        children
      )}
    </header>
  );
}
