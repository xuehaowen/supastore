import { describe, expect, it } from "vitest";
import {
  encodeLedgerCursor,
  parseLedgerCursor,
} from "@/infrastructure/db/ledger-cursor";

describe("ledger cursor", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  it("preserves microseconds and the UUID tie breaker", () => {
    const timestamp = "2026-09-16T12:34:56.123456Z";
    expect(
      parseLedgerCursor(decodeURIComponent(encodeLedgerCursor(timestamp, id))),
    ).toEqual({ timestamp, id });
  });
  it("rejects malformed or impossible dates before PostgreSQL casting", () => {
    for (const value of [
      undefined,
      "",
      "2026-02-30T12:34:56.123456Z~" + id,
      "2026-09-16T25:34:56.123456Z~" + id,
      "2026-09-16T12:34:56.123Z~" + id,
      "2026-09-16T12:34:56.123456Z~bad",
      "0000-01-01T12:34:56.123456Z~" + id,
      "x".repeat(100),
    ])
      expect(parseLedgerCursor(value)).toBeUndefined();
  });
});
