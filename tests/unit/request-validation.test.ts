import { describe, expect, it } from "vitest";
import {
  parseActionBoolean,
  parseActionEnum,
  parseActionInteger,
  parseActionDestination,
  parseActionRequiredText,
  parseActionUuid,
} from "@/application/common/request-validation";

describe("request validation helpers", () => {
  it("rejects missing and blank required text", () => {
    expect(() => parseActionRequiredText(undefined, "Reason")).toThrow(
      "Reason is required.",
    );
    expect(() => parseActionRequiredText("  ", "Reason")).toThrow(
      "Reason is required.",
    );
  });

  it("enforces bounded integer values", () => {
    expect(parseActionInteger("12", "Quantity", 1, 99)).toBe(12);
    expect(() => parseActionInteger("1.5", "Quantity", 1, 99)).toThrow(
      "Quantity must be an integer.",
    );
    expect(() => parseActionInteger("100", "Quantity", 1, 99)).toThrow(
      "Quantity must be at most 99.",
    );
    expect(() => parseActionInteger("nope", "Quantity", 1, 99)).toThrow(
      "Quantity must be an integer.",
    );
  });

  it("rejects unknown enum values instead of defaulting", () => {
    expect(parseActionEnum("pickup", "Fulfillment", ["shipping", "pickup"] as const)).toBe(
      "pickup",
    );
    expect(() =>
      parseActionEnum("courier", "Fulfillment", ["shipping", "pickup"] as const),
    ).toThrow("Fulfillment is invalid.");
  });

  it("parses explicit booleans and UUIDs", () => {
    expect(parseActionBoolean("true", "Verified")).toBe(true);
    expect(parseActionBoolean("false", "Verified")).toBe(false);
    expect(() => parseActionBoolean("yes", "Verified")).toThrow(
      "Verified must be true or false.",
    );
    expect(parseActionUuid("00000000-0000-0000-0000-000000000001", "Order")).toBe(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(() => parseActionUuid("not-an-id", "Order")).toThrow(
      "Order is invalid.",
    );
  });

  it("requires a supported, non-empty payout destination", () => {
    expect(parseActionDestination("bank_account", "acct-123")).toEqual({
      type: "bank_account",
      rawDestination: "acct-123",
    });
    expect(() => parseActionDestination("crypto", "wallet")).toThrow(
      "Destination type is invalid.",
    );
    expect(() => parseActionDestination("cash", " ")).toThrow(
      "Destination is required.",
    );
  });
});
