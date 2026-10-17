import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LaunchChecklist } from "@/app/admin/launch-checklist";
it("gives an owner a direct action and distinguishes configured from live acceptance", () => {
  const html = renderToStaticMarkup(createElement(LaunchChecklist, { checklist: [{ key: "products", label: "Published product", isReady: false }] }));
  expect(html).toContain('href="/admin/products"');
  expect(html).toContain("Next step");
  expect(html).toContain("Publish your first available product");
  expect(html).toContain("Still needed");
});
it("shows completed configuration without claiming real payments or backups work", () => {
  const html = renderToStaticMarkup(createElement(LaunchChecklist, { checklist: [{ key: "settings", label: "Store profile", isReady: true }] }));
  expect(html).toContain("Configuration checks complete");
  expect(html).toContain("controlled order");
  expect(html).toContain("backup");
  expect(html).not.toContain("Next step");
});
