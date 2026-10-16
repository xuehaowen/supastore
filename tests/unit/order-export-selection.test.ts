import { describe, expect, it } from "vitest";
import { parseOrderExportSelection } from "@/domain/catalog/order-export-selection";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
describe("order export scope", () => {
  it("deduplicates selected IDs without falling back to all orders", () => {
    expect(
      parseOrderExportSelection(
        new URLSearchParams({
          scope: "selected",
          ids: `${first},${second},${first}`,
        }),
      ),
    ).toEqual({ ids: [first, second] });
  });
  it.each(["", "bad-id", `${first},bad-id`])(
    "rejects invalid selection %s",
    (ids) => {
      expect(() =>
        parseOrderExportSelection(
          new URLSearchParams({ scope: "selected", ids }),
        ),
      ).toThrow("Select between");
    },
  );
  it("bounds selected exports to 50 orders", () => {
    const ids = Array.from(
      { length: 51 },
      (_, index) =>
        `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    );
    expect(() =>
      parseOrderExportSelection(
        new URLSearchParams({ scope: "selected", ids: ids.join(",") }),
      ),
    ).toThrow("Select between");
  });
  it("passes matching order filters to either export format", () => {
    expect(
      parseOrderExportSelection(
        new URLSearchParams({
          scope: "filtered",
          q: " Buyer ",
          status: "unpaid",
        }),
      ),
    ).toEqual({ search: "Buyer", status: "unpaid" });
    expect(
      parseOrderExportSelection(
        new URLSearchParams({ scope: "all", q: "Buyer" }),
      ),
    ).toEqual({});
  });
  it.each([
    { scope: "unknown" },
    { scope: "filtered", status: "invalid" },
    { scope: "filtered", q: "x".repeat(121) },
  ])("rejects invalid scope or filters", (values) => {
    expect(() =>
      parseOrderExportSelection(new URLSearchParams(values)),
    ).toThrow();
  });
});
