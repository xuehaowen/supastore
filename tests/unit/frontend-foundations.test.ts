import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../../apps/storefront/app/actions", () => ({
  addItem: vi.fn(),
  updateCartItem: vi.fn(),
}));
import { CartContents } from "../../apps/storefront/app/cart-contents";
import { CategoryNavigation } from "../../apps/storefront/app/category-navigation";
import { textFor } from "@supastore/i18n/messages";
import {
  OrderSelection,
  OrderExportToolbar,
} from "@/app/admin/order-selection";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("frontend visual foundations", () => {
  it("provides component styles for every legacy admin layout hook", async () => {
    const stylesheet = await readFile(
      path.join(workspaceRoot, "apps/backend/src/app/globals.css"),
      "utf8",
    );

    for (const selector of [
      ".admin",
      ".admin-grid",
      ".panel",
      ".metrics",
      ".queue-row",
      ".eyebrow",
      ".two-col",
      ".check",
      ".narrow",
      ".standalone",
    ]) {
      expect(stylesheet).toMatch(new RegExp(`\\${selector}\\s*\\{`));
    }
  });

  it("gives the storefront shell a labeled support landmark", async () => {
    const shopLayout = await readFile(
      path.join(workspaceRoot, "apps/storefront/app/[locale]/layout.tsx"),
      "utf8",
    );

    expect(shopLayout).toContain('role="contentinfo"');
    expect(shopLayout).toContain(
      "aria-label={textFor(locale).common.customerSupport}",
    );
  });

  it("marks the active catalog filter for assistive technology", async () => {
    const catalog = await readFile(
      path.join(workspaceRoot, "apps/storefront/app/catalog.tsx"),
      "utf8",
    );

    expect(catalog).toContain("catalog-active-filters");
    expect(catalog).toContain(
      "aria-label={textFor(locale).ui.activeFilters}",
    );
    const markup = renderToStaticMarkup(
      createElement(CategoryNavigation, {
        locale: "en",
        query: { category: "cups" },
        groups: [
          {
            id: "cups",
            slug: "cups",
            name: "Cups",
            parentId: null,
            depth: 0,
            sortOrder: 0,
            createdAt: "2026-10-23T00:00:00Z",
            updatedAt: "2026-10-23T00:00:00Z",
          },
        ],
      }),
    );
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("category=cups");
  });

  it("provides responsive image sizing on product detail pages", async () => {
    const productPage = await readFile(
      path.join(workspaceRoot, "apps/storefront/app/product-purchase.tsx"),
      "utf8",
    );

    expect(productPage).toContain('sizes="(max-width: 767px) 88vw, 50vw"');
  });

  it("uses an order-summary landmark in the cart", () => {
    const html = renderToStaticMarkup(
      createElement(CartContents, {
        locale: "en",
        currency: "USD",
        precision: 2,
        cart: {
          id: "cart",
          revision: 1,
          subtotalCents: 1000,
          itemCount: 1,
          items: [
            {
              id: "item",
              variantId: "variant",
              sku: "SKU",
              title: "Blue",
              productTitle: "Cup",
              productHandle: "cup",
              priceCents: 1000,
              quantity: 1,
              lineTotalCents: 1000,
              isAvailable: true,
              imageKey: null,
            },
          ],
        },
      }),
    );
    expect(html).toContain(
      `<aside aria-label="${textFor("en").common.summary}"`,
    );
  });

  it("requires an explicit order selection before CSV or XLSX export", () => {
    const html = renderToStaticMarkup(
      createElement(OrderSelection, {
        pageIds: ["example"],
        children: createElement(OrderExportToolbar, { search: "", status: "" }),
      }),
    );
    expect(html).toContain("Selected orders (0)");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Export orders CSV<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Export orders XLSX<\/button>/,
    );
  });

  it("does not render raw buttons, selects, or textareas in application pages", async () => {
    const pages = await Promise.all(
      [
        "apps/backend/src/app/admin/page.tsx",
        "apps/backend/src/app/admin/operations.tsx",
        "apps/backend/src/app/admin/orders-view.tsx",
        "apps/backend/src/app/admin/payments-view.tsx",
        "apps/backend/src/app/admin/overview-view.tsx",
        "apps/backend/src/app/admin/fulfillment-operations.tsx",
        "apps/backend/src/app/admin/products/[id]/edit/page.tsx",
        "apps/backend/src/app/admin/products/page.tsx",
        "apps/backend/src/app/admin/products/import/page.tsx",
        "apps/backend/src/app/admin/orders/[id]/packing-slip/page.tsx",
        "apps/backend/src/app/admin/setup/page.tsx",
        "apps/storefront/app/[locale]/checkout/page.tsx",
        "apps/storefront/app/checkout-fields.tsx",
      ].map((file) => readFile(path.join(workspaceRoot, file), "utf8")),
    );

    for (const page of pages) {
      expect(page).not.toMatch(/<(button|select|textarea)\b/);
    }
  });
});
