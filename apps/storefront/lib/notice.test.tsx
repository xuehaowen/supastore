import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Notice } from "../app/components";
it("renders a validated failure reference separately from translated error text", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  expect(
    renderToStaticMarkup(
      <Notice error="Unable to save." locale="zh" requestId={requestId} />,
    ),
  ).toContain(requestId);
  expect(
    renderToStaticMarkup(
      <Notice
        error="Unable to save."
        locale="zh"
        requestId="untrusted-reference"
      />,
    ),
  ).not.toContain("untrusted-reference");
});
