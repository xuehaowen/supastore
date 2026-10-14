import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

    expect(catalog).toContain(
      'aria-current={query.category ? undefined : "page"}',
    );
    expect(catalog).toContain(
      'aria-current={query.category === g.slug ? "page" : undefined}',
    );
  });

  it("provides responsive image sizing on product detail pages", async () => {
    const productPage = await readFile(
      path.join(workspaceRoot, "apps/storefront/app/product-purchase.tsx"),
      "utf8",
    );

    expect(productPage).toContain('sizes="(max-width: 767px) 88vw, 50vw"');
  });

  it("uses an order-summary landmark in the cart", async () => {
    const cartPage = await readFile(
      path.join(workspaceRoot, "apps/storefront/app/[locale]/cart/page.tsx"),
      "utf8",
    );

    expect(cartPage).toContain("aria-label={textFor(locale).common.summary}");
  });

  it("offers the order CSV export from the order management page", async () => {
    const operations = await readFile(
      path.join(workspaceRoot, "apps/backend/src/app/admin/orders-view.tsx"),
      "utf8",
    );
    expect(operations).toContain('href="/api/admin/exports/orders"');
    expect(operations).toContain("Export orders CSV");
    expect(operations).toContain(
      'href="/api/admin/exports/orders?format=xlsx"',
    );
    expect(operations).toContain("Export orders XLSX");
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
        "apps/backend/src/app/checkout-fields.tsx",
      ].map((file) => readFile(path.join(workspaceRoot, file), "utf8")),
    );

    for (const page of pages) {
      expect(page).not.toMatch(/<(button|select|textarea)\b/);
    }
  });
});
