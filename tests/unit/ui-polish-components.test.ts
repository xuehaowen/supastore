import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrencyField } from "@/app/admin/currency-field";
import { WeeklyScheduleEditor } from "@/app/admin/weekly-schedule-editor";
import { WorkspaceProvider } from "@/app/admin/workspace-context";
import { ProductEditorNav } from "@/app/admin/product-editor-nav";
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/products/example/specifications",
}));

describe("merchant form polish", () => {
  it("shows staff the accessible product specifications tab", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceProvider, {
        owner: false,
        currency: "USD",
        precision: 2,
        children: createElement(ProductEditorNav, { productId: "example" }),
      }),
    );
    expect(html).toContain('href="/admin/products/example/specifications"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("/example/edit");
  });
  it("keeps an optional empty monetary threshold empty instead of turning it into zero", () => {
    const html = renderToStaticMarkup(
      createElement(CurrencyField, {
        name: "freeThreshold",
        label: "Free shipping threshold",
        value: "",
        required: false,
        currency: "USD",
        precision: 2,
      }),
    );
    expect(html).toMatch(/name="freeThreshold" value=""/);
    expect(html).toMatch(/type="number"[^>]*value=""/);
    const zero = renderToStaticMarkup(
      createElement(CurrencyField, {
        name: "rate",
        label: "Rate",
        value: 0,
        currency: "USD",
        precision: 2,
      }),
    );
    expect(zero).toMatch(/type="number"[^>]*value="0.00"/);
  });
  it("preserves existing split schedules in the submitted field and labels each window", () => {
    const schedule: Record<string, [string, string][]> = {
      mon: [
        ["09:00", "12:00"],
        ["13:00", "17:00"],
      ],
      tue: [],
    };
    const html = renderToStaticMarkup(
      createElement(WeeklyScheduleEditor, { value: schedule }),
    );
    const encoded = /name="weeklySchedule" value="([^"]*)"/.exec(html)?.[1];
    expect(encoded).toBeDefined();
    expect(JSON.parse(encoded!.replaceAll("&quot;", '"'))).toEqual(schedule);
    expect(html).toContain('aria-label="Monday window 2 start"');
    expect(html).toContain('value="13:00"');
    expect(html).not.toContain("Weekly schedule JSON");
  });
});
