import { expect, it } from "vitest";
import { launchGuidance } from "@/app/admin/launch-guidance";

it("puts profile, products and fulfillment before provider details", () => {
  const checklist = [
    "templates",
    "settings",
    "products",
    "payment",
    "fulfillment",
    "email",
  ].map((key) => ({ key, isReady: false }));
  expect(launchGuidance(checklist)).toMatchObject({
    key: "settings",
    href: "/admin/setup#store-profile",
  });
  checklist.find((c) => c.key === "settings")!.isReady = true;
  expect(launchGuidance(checklist)).toMatchObject({
    key: "products",
    href: "/admin/products",
  });
  checklist.find((c) => c.key === "products")!.isReady = true;
  expect(launchGuidance(checklist)).toMatchObject({
    key: "fulfillment",
    href: "/admin/settings/commerce",
  });
});
it("routes remaining requirements to the existing settings and never calls a checklist a live sales test", () => {
  for (const [key, href] of [
    ["payment", "/admin/setup#payment-methods"],
    ["email", "/admin/setup#payment-methods"],
    ["templates", "/admin/settings/notifications"],
  ]) {
    expect(launchGuidance([{ key: key!, isReady: false }])).toMatchObject({
      key,
      href,
    });
  }
  expect(launchGuidance([{ key: "settings", isReady: true }])).toBeNull();
  expect(launchGuidance([{ key: "unknown", isReady: false }])).toBeNull();
  expect(launchGuidance([])).toBeNull();
});
