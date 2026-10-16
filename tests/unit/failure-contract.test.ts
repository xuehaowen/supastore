import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainError, UnauthorizedError, ConflictError } from "@/application/common/errors";
import { describeFailure } from "@/infrastructure/http/commerce-api";
import { logger } from "@/infrastructure/security/logger";
import { smtpFailure } from "@/infrastructure/notifications/provider-errors";

afterEach(() => vi.restoreAllMocks());
describe("safe failure contract", () => {
  it.each([
    [new DomainError("Choose a quantity."), 400, "validation"],
    [new UnauthorizedError(), 401, "authentication"],
    [new ConflictError(), 409, "conflict"],
    [new DomainError("Try later.", "DEPENDENCY_UNAVAILABLE"), 503, "dependency"],
    [new DomainError("Review payment.", "OUTCOME_UNCERTAIN"), 409, "uncertain"],
  ])("classifies expected errors", (error, status, category) => {
    expect(describeFailure(error, "test.operation")).toMatchObject({ status, category });
  });
  it("correlates diagnostics without logging raw messages, credentials or bodies", () => {
    const write = vi.fn();
    const child = vi.spyOn(logger, "child").mockReturnValue({ ...logger, error: write });
    const failure = describeFailure(Object.assign(new Error("postgres://user:secret@host token=private"), { code: "ECONNREFUSED" }), "checkout.create");
    expect(failure).toMatchObject({ status: 500, category: "unexpected", retryable: false });
    expect(failure.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(child).toHaveBeenCalledWith(expect.objectContaining({ requestId: failure.requestId, operation: "checkout.create", failureCode: "ECONNREFUSED" }));
    expect(JSON.stringify([failure, child.mock.calls, write.mock.calls])).not.toContain("secret");
    expect(JSON.stringify(write.mock.calls)).not.toContain("private");
  });
});
describe("SMTP submission certainty", () => {
  it.each(["CONN", "EHLO", "STARTTLS", "AUTH", "MAIL FROM", "RCPT TO"])("retries socket loss before DATA at %s", command => {
    expect(smtpFailure({ code: "ECONNECTION", command })).toEqual({ status: "rejected", code: "SMTP_CONNECT", retryable: true });
  });
  it.each(["DATA", undefined])("retains uncertainty after DATA or with an unknown stage", command => {
    expect(smtpFailure({ code: "ECONNECTION", command })).toMatchObject({ status: "unknown" });
  });
});

