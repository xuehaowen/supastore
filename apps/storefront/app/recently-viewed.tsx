"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { textFor } from "@supastore/i18n/messages";
import { Button } from "@supastore/ui/button";

type ViewedProduct = { handle: string; title: string };

export function RecentlyViewed({
  locale,
  handle,
  title,
}: ViewedProduct & { locale: string }) {
  const [products, setProducts] = useState<ViewedProduct[]>([]);
  const storageKey = `supastore-recently-viewed-${locale}`;
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        sessionStorage.getItem(storageKey) || "[]",
      );
      const previous = Array.isArray(stored)
        ? stored
            .filter(
              (item): item is ViewedProduct =>
                item !== null &&
                typeof item === "object" &&
                typeof item.handle === "string" &&
                item.handle.length > 0 &&
                item.handle.length <= 200 &&
                typeof item.title === "string" &&
                item.title.length > 0 &&
                item.title.length <= 300 &&
                item.handle !== handle,
            )
            .slice(0, 5)
        : [];
      setProducts(previous);
      sessionStorage.setItem(
        storageKey,
        JSON.stringify([{ handle, title }, ...previous]),
      );
    } catch {
      // Browsing remains usable when tab storage is unavailable.
      setProducts([]);
    }
  }, [handle, title, storageKey]);
  if (!products.length) return null;
  const t = textFor(locale).ui;
  return (
    <section
      className="recently-viewed"
      aria-labelledby="recently-viewed-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="recently-viewed-heading">{t.recentlyViewed}</h2>
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            setProducts([]);
            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              /* Storage may be disabled. */
            }
          }}
        >
          {t.clearRecentlyViewed}
        </Button>
      </div>
      <ul>
        {products.map((product) => (
          <li key={product.handle}>
            <Link
              href={`/${locale}/products/${encodeURIComponent(product.handle)}`}
            >
              {product.title}
              <span aria-hidden="true"> ↗</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
