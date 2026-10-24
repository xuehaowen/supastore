import { describe, expect, it } from "vitest";
import { parseOrderFilters } from "@/domain/catalog/order-filters";
import { parseOrderExportSelection } from "@/domain/catalog/order-export-selection";
import { adminReturnContext } from "@/application/common/admin-return-context";

describe("order filters", () => {
  const filters = {
    customer: "Buyer",
    pickupLocation: "Market",
    pickupFrom: "2026-10-01",
    pickupTo: "2026-10-31",
    createdFrom: "2026-09-01",
    createdTo: "2026-10-31",
    minTotal: "12.50",
    maxTotal: "25",
    fulfillmentType: "pickup",
    sort: "total",
    direction: "asc",
  };
  it("shares combined filters between the list and filtered exports", () => {
    expect(parseOrderFilters(new URLSearchParams(filters))).toEqual(filters);
    expect(
      parseOrderExportSelection(
        new URLSearchParams({ ...filters, scope: "filtered" }),
      ),
    ).toEqual(filters);
    const path = `/admin/orders?${new URLSearchParams({ ...filters, page: "2" })}`;
    expect(adminReturnContext(path)).toBe(path);
  });
  it("only carries ordering into selected and all-order exports", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      parseOrderExportSelection(
        new URLSearchParams({ ...filters, scope: "selected", ids: id }),
      ),
    ).toEqual({ ids: [id], sort: "total", direction: "asc" });
    expect(
      parseOrderExportSelection(
        new URLSearchParams({ ...filters, scope: "all" }),
      ),
    ).toEqual({ sort: "total", direction: "asc" });
  });
  it.each([
    { sort: "bad" },
    { sort: "__proto__" },
    { direction: "sideways" },
    { minTotal: "1e3" },
    { minTotal: "-1" },
    { maxTotal: "1.1234567" },
    { createdFrom: "2026-02-30" },
    { pickupTo: "bad" },
    { pickupTimeFrom: "24:00" },
    { pickupTimeFrom: "12:00", pickupTimeTo: "10:00" },
    { createdFrom: "2026-10-02", createdTo: "2026-10-01" },
    { pickupFrom: "2026-10-02", pickupTo: "2026-10-01" },
    { minTotal: "10", maxTotal: "2" },
    { customer: "x".repeat(121) },
    { pickupLocation: "x".repeat(121) },
    { fulfillmentType: "bad" },
  ])("rejects invalid values and reversed ranges: %j", (values) => {
    expect(() => parseOrderFilters(new URLSearchParams(values))).toThrow();
  });
  it("ignores empty and unrelated fields", () => {
    expect(
      parseOrderFilters(new URLSearchParams({ customer: "  ", page: "2" })),
    ).toEqual({});
  });
});
