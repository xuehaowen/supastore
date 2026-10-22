import { expect, it } from "vitest";
import { storePageKeys, storePageContent } from "@supastore/contracts";

it("provides English and Chinese content for all common pages on an empty store", () => {
  const store = { defaultLocale: "en", publicContent: {} };
  for (const locale of ["en", "zh"] as const) {
    for (const key of storePageKeys)
      expect(storePageContent(store, locale, key).length).toBeGreaterThan(20);
  }
});
it("prefers authored content and falls back through the store locale before defaults", () => {
  const store = {
    defaultLocale: "zh",
    publicContent: {
      en: { support: "English help" },
      zh: { support: "中文帮助", privacy: "隐私说明" },
    },
  };
  expect(storePageContent(store, "en", "support")).toBe("English help");
  expect(storePageContent(store, "en", "privacy")).toBe("隐私说明");
  expect(
    storePageContent(
      { defaultLocale: "en", publicContent: { en: { terms: "  " } } },
      "en",
      "terms",
    ),
  ).toContain("Review the product");
});
