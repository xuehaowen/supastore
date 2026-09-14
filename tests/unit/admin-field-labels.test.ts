import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Field } from "@/app/components";
describe("repeated admin forms", () => {
  it("gives repeated fields unique label targets", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(Field, { name: "reason", label: "Refund reason" }),
        createElement(Field, { name: "reason", label: "Cancellation reason" }),
      ),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
    const targets = [...html.matchAll(/\sfor="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(targets).toEqual(ids);
  });
});
