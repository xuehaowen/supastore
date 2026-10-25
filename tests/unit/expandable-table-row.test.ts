import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ExpandableTableRow,
  type ExpandableTableRowProps,
} from "@supastore/ui/expandable-table-row";

function renderRows(rows: Partial<ExpandableTableRowProps>[]) {
  return renderToStaticMarkup(
    createElement(
      "table",
      null,
      createElement(
        "tbody",
        null,
        rows.map((props, index) =>
          createElement(ExpandableTableRow, {
            key: index,
            columnCount: 2,
            detailsLabel: `Details ${index}`,
            details: createElement("p", null, "Private detail content"),
            children: createElement("td", null, "Summary"),
            ...props,
          }),
        ),
      ),
    ),
  );
}

describe("shared expandable table row", () => {
  it("starts collapsed and keeps detail content out of the rendered table", () => {
    const html = renderRows([{ expandLabel: "Show payment details" }]);
    expect(html).toContain("Summary");
    expect(html).toContain('aria-label="Show payment details"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("Private detail content");
    expect(html.match(/<tr\b/g)).toHaveLength(1);
  });
  it("accepts arbitrary detail content, labels, and a configured column span", () => {
    const html = renderRows([
      {
        defaultExpanded: true,
        columnCount: 5,
        detailsLabel: "User details",
        collapseLabel: "Hide user details",
        details: createElement(
          "dl",
          null,
          createElement("dt", null, "Email"),
          createElement("dd", null, "user@example.test"),
        ),
      },
    ]);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Hide user details"');
    expect(html).toContain('colSpan="5"');
    expect(html).toContain('aria-label="User details"');
    expect(html).toContain("user@example.test");
    const controls = html.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${controls}"`);
  });
  it("generates separate disclosure targets for repeated rows", () => {
    const html = renderRows([
      { defaultExpanded: true },
      { defaultExpanded: true },
    ]);
    const targets = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(2);
    for (const target of targets) expect(html).toContain(`id="${target}"`);
  });
});
