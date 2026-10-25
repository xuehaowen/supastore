import { describe, expect, it } from "vitest";
import { normalizeDisplayReference } from "@/domain/money/display-reference";

describe("display reference search", () => {
  it.each([
    [" ord000123 ", "ORD-000123"],
    ["ORD 000 123", "ORD-000123"],
    ["ord-123", "ORD-000123"],
    ["pay000123", "PAY-000123"],
    ["PAY-1000000", "PAY-1000000"],
    ["ORD-000000123", "ORD-000123"],
    ["123", "123"],
    ["", ""],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeDisplayReference(input)).toBe(expected);
  });
});
