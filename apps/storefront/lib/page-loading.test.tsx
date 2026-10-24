import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageLoadingSkeleton } from "../app/page-loading";

it.each(["catalog", "product", "checkout"] as const)(
  "announces %s loading and respects reduced motion",
  (kind) => {
    const html = renderToStaticMarkup(
      <PageLoadingSkeleton kind={kind} locale="en" />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).toContain("Loading the shop");
  },
);
it("localizes the loading announcement", () => {
  expect(renderToStaticMarkup(<PageLoadingSkeleton locale="zh" />)).toContain(
    "正在加载商店",
  );
});
