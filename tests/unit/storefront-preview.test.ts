import { expect, it } from "vitest";
import { storefrontPreviewDocument } from "../../apps/backend/src/app/admin/setup/storefront-preview";

it("escapes untrusted merchant content in script-free draft previews and resolves locale fallback", () => {
  const document = storefrontPreviewDocument(
    {
      imageKey: "catalog/a&b.png",
      imagePosition: "bottom",
      en: {
        heading: '<script>alert("draft")</script>',
        body: "A & B",
        imageAlt: '" onerror="alert(1)',
      },
      zh: { heading: "日常", body: "", imageAlt: "" },
    },
    "zh",
    "en",
    "<Store>",
    ["<Collection>"],
  );
  expect(document).toContain("日常");
  expect(document).toContain("A &amp; B");
  expect(document).toContain("&lt;Store&gt;");
  expect(document).toContain("<title>&lt;Store&gt; ·");
  expect(document).toContain("&lt;Collection&gt;");
  expect(document).not.toContain("<script>");
  expect(document).not.toContain(' onerror="');
  expect(document).toContain("object-position:center bottom");
  expect(document).toContain("catalog%2Fa%26b.png");
});
