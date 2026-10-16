import { describe, expect, it } from "vitest";
import {
  currentAdminLocation,
  visibleAdminNavigation,
} from "../../apps/backend/src/app/admin/navigation";

describe("admin navigation", () => {
  it.each([
    ["/admin/inventory", "Products", "Inventory"],
    ["/admin/inventory/variant-id", "Products", "Inventory"],
    ["/admin/inventory/pending", "Products", "Overdue stock & credit holds"],
    ["/admin/inventory/slots", "Fulfillment", "Schedules & capacity"],
    ["/admin/fulfillment/shipments", "Fulfillment", "Shipments & booking"],
    ["/admin/products/import", "Products", "Import & export"],
    ["/admin/products/mapping", "Products", "Import mappings"],
    ["/admin/products/123/edit", "Products", "All products"],
    ["/admin/returns/123", "Orders", "Returns"],
    ["/admin/store-credit/123", "Customers", "Store credit"],
    ["/admin/settings/notifications/123", "Settings", "Notifications"],
    ["/admin/settings/delivery", "Settings", "Local delivery areas"],
    ["/admin/translations", "Settings", "Languages & translations"],
    ["/admin/reconciliation", "Payments", "Credit & stock reconciliation"],
  ])("places %s in its section", (path, section, page) => {
    const current = currentAdminLocation(path, true);
    expect(current?.section.label).toBe(section);
    expect(current?.page.label).toBe(page);
  });

  it("hides owner-only sections and nested pages from staff", () => {
    const paths = visibleAdminNavigation(false).flatMap((group) =>
      group.sections.flatMap((section) => [
        section.href,
        ...(section.children?.map((child) => child.href) ?? []),
      ]),
    );
    for (const path of [
      "/admin/setup",
      "/admin/promotions",
      "/admin/reconciliation",
      "/admin/activity",
      "/admin/settings/notifications",
    ]) {
      expect(paths).not.toContain(path);
      expect(currentAdminLocation(path, false)).toBeUndefined();
    }
    expect(paths).toContain("/admin/inventory");
    expect(paths).toContain("/admin/inventory/slots");
    for (const path of [
      "/admin/categories",
      "/admin/collections",
      "/admin/attributes",
      "/admin/products/mapping",
    ]) {
      expect(paths).not.toContain(path);
    }
  });

  it("matches route boundaries without treating unknown pages as Overview", () => {
    expect(currentAdminLocation("/admin", false)?.page.label).toBe("Overview");
    expect(currentAdminLocation("/admin/products-other", true)).toBeUndefined();
    expect(currentAdminLocation("/admin/unknown", true)).toBeUndefined();
  });
});
